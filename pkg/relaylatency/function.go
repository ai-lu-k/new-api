// Package relaylatency estimates a channel/upstream-model's time to first
// meaningful output. Public aliases, prices and failover positions are not features.
package relaylatency

import (
	"errors"
	"fmt"
	"math"
	"slices"
)

const Version = 1
const dimensions = 18

var efforts = [...]string{"none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"}

type Sample struct {
	At           int64
	Effort       string
	InputTokens  int
	Milliseconds int64
	Censored     bool
}

type Function struct {
	Version      int                 `json:"version"`
	Coefficients [dimensions]float64 `json:"coefficients"`
	Sigma        float64             `json:"sigma"`
	TailScale    float64             `json:"tail_scale"`
	Quantile     float64             `json:"quantile"`
	MinTokens    int                 `json:"min_tokens"`
	MaxTokens    int                 `json:"max_tokens"`
	Efforts      []string            `json:"efforts"`
	Samples      int                 `json:"samples"`
	Censored     int                 `json:"censored"`
	Validation   Validation          `json:"validation"`
}

type Validation struct {
	Samples         int     `json:"samples"`
	MissFraction    float64 `json:"miss_fraction"`
	UnknownFraction float64 `json:"unknown_fraction"`
	BaselineMiss    float64 `json:"baseline_60s_miss_fraction"`
}

// Predict returns the provider distribution's quantile in seconds. Operational
// bounds and any future retail-price multiplier belong to the caller.
func (f Function) Predict(effort string, inputTokens int) (float64, bool) {
	if f.Version != Version || f.TailScale <= 0 || inputTokens < f.MinTokens || inputTokens > f.MaxTokens || !slices.Contains(f.Efforts, effort) {
		return 0, false
	}
	x := features(effort, inputTokens)
	seconds := math.Exp(dot(f.Coefficients, x)) * f.TailScale
	return seconds, seconds > 0 && !math.IsNaN(seconds) && !math.IsInf(seconds, 0)
}

// Fit uses a log-normal accelerated-failure-time likelihood, including the
// survival likelihood for right-censored observations. Chronological 60/20/20
// partitions separately train, calibrate the tail, and validate it. A tail that
// cannot be identified from the calibration observations is never published.
func Fit(samples []Sample, quantile float64, minimum int) (Function, error) {
	if quantile < .9 || quantile >= 1 || minimum < 25 || len(samples) < minimum {
		return Function{}, errors.New("insufficient samples or invalid quantile")
	}
	data := slices.Clone(samples)
	for _, s := range data {
		if s.InputTokens <= 0 || s.Milliseconds < 1 || s.Milliseconds > 24*60*60*1000 || !validEffort(s.Effort) {
			return Function{}, errors.New("invalid latency sample")
		}
	}
	slices.SortStableFunc(data, func(a, b Sample) int {
		if a.At < b.At {
			return -1
		}
		if a.At > b.At {
			return 1
		}
		return 0
	})
	trainEnd, calibrationEnd := len(data)*3/5, len(data)*4/5
	train, calibration, validation := data[:trainEnd], data[trainEnd:calibrationEnd], data[calibrationEnd:]
	f := Function{Version: Version, Quantile: quantile, Samples: len(data), MinTokens: data[0].InputTokens, MaxTokens: data[0].InputTokens}
	var exact []float64
	for _, s := range train {
		if !s.Censored {
			exact = append(exact, math.Log(float64(s.Milliseconds)/1000))
		}
		f.MinTokens = min(f.MinTokens, s.InputTokens)
		f.MaxTokens = max(f.MaxTokens, s.InputTokens)
		if !slices.Contains(f.Efforts, s.Effort) {
			f.Efforts = append(f.Efforts, s.Effort)
		}
	}
	if len(exact) < max(10, len(train)/5) {
		return Function{}, errors.New("insufficient exact observations")
	}
	for _, y := range exact {
		f.Coefficients[0] += y / float64(len(exact))
	}
	variance := 0.0
	for _, y := range exact {
		variance += math.Pow(y-f.Coefficients[0], 2) / float64(len(exact))
	}
	eta := math.Log(math.Max(.2, math.Sqrt(variance)))
	var momentum, velocity [dimensions + 1]float64
	for iteration := 1; iteration <= 350; iteration++ {
		var gradient [dimensions + 1]float64
		sigma := math.Exp(eta)
		for _, s := range train {
			x := features(s.Effort, s.InputTokens)
			z := (math.Log(float64(s.Milliseconds)/1000) - dot(f.Coefficients, x)) / sigma
			dMu, dEta := -z/sigma, 1-z*z
			if s.Censored {
				mills := inverseMills(z)
				dMu, dEta = -mills/sigma, -mills*z
			}
			for j, value := range x {
				gradient[j] += dMu * value / float64(len(train))
			}
			gradient[dimensions] += dEta / float64(len(train))
		}
		for j := range dimensions + 1 {
			if j > 0 && j < dimensions {
				gradient[j] += .002 * f.Coefficients[j]
			}
			g := max(-20.0, min(20.0, gradient[j]))
			momentum[j] = .9*momentum[j] + .1*g
			velocity[j] = .999*velocity[j] + .001*g*g
			step := .035 * (momentum[j] / (1 - math.Pow(.9, float64(iteration)))) / (math.Sqrt(velocity[j]/(1-math.Pow(.999, float64(iteration)))) + 1e-8)
			if j == dimensions {
				eta = max(-3.0, min(2.0, eta-step))
			} else {
				f.Coefficients[j] -= step
			}
		}
	}
	f.Sigma = math.Exp(eta)
	// Kaplan-Meier calibration does not pretend that a timeout is an exact
	// response. If the survival curve never reaches the requested tail, abstain.
	residuals := make([]Sample, len(calibration))
	for i, s := range calibration {
		residuals[i] = s
		ratio := float64(s.Milliseconds) * math.Exp(-dot(f.Coefficients, features(s.Effort, s.InputTokens)))
		if math.IsNaN(ratio) || math.IsInf(ratio, 0) || ratio > math.MaxInt64 || ratio <= 0 {
			return Function{}, errors.New("unstable latency fit")
		}
		residuals[i].Milliseconds = max(1, int64(math.Ceil(ratio)))
	}
	slices.SortFunc(residuals, func(a, b Sample) int {
		if a.Milliseconds < b.Milliseconds {
			return -1
		}
		if a.Milliseconds > b.Milliseconds {
			return 1
		}
		return 0
	})
	atRisk, survival := len(residuals), 1.0
	for i := 0; i < len(residuals); {
		j, events := i, 0
		for j < len(residuals) && residuals[j].Milliseconds == residuals[i].Milliseconds {
			if !residuals[j].Censored {
				events++
			}
			j++
		}
		survival *= 1 - float64(events)/float64(atRisk)
		if survival <= 1-quantile+1e-12 {
			f.TailScale = float64(residuals[i].Milliseconds) / 1000
			break
		}
		atRisk -= j - i
		i = j
	}
	if f.TailScale <= 0 {
		return Function{}, errors.New("right-censored calibration tail is not identifiable")
	}
	// A temporarily fast calibration slice may widen the AFT tail but cannot
	// erase slow observations represented by the censored likelihood fit.
	f.TailScale = max(f.TailScale, math.Exp(f.Sigma*math.Sqrt2*math.Erfinv(2*quantile-1)))
	miss, unknown, baseline := 0, 0, 0
	for _, s := range validation {
		budget := math.Exp(dot(f.Coefficients, features(s.Effort, s.InputTokens))) * f.TailScale * 1000
		if _, supported := f.Predict(s.Effort, s.InputTokens); !supported {
			budget = 60000
		}
		if float64(s.Milliseconds) > budget || s.Censored && float64(s.Milliseconds) >= budget {
			miss++
		} else if s.Censored {
			unknown++
		}
		if s.Milliseconds > 60000 || s.Censored && s.Milliseconds == 60000 {
			baseline++
		}
	}
	f.Validation = Validation{Samples: len(validation), MissFraction: float64(miss) / float64(len(validation)), UnknownFraction: float64(unknown) / float64(len(validation)), BaselineMiss: float64(baseline) / float64(len(validation))}
	if f.Validation.UnknownFraction > .25 || f.Validation.MissFraction > max(2*(1-quantile), f.Validation.BaselineMiss+.01) {
		return Function{}, fmt.Errorf("validation rejected latency function: misses=%.4f unknown=%.4f baseline_60s_misses=%.4f", f.Validation.MissFraction, f.Validation.UnknownFraction, f.Validation.BaselineMiss)
	}
	for _, s := range data {
		if s.Censored {
			f.Censored++
		}
	}
	return f, nil
}

func validEffort(effort string) bool { return effort == "" || slices.Contains(efforts[:], effort) }

func features(effort string, tokens int) [dimensions]float64 {
	var x [dimensions]float64
	x[0], x[1] = 1, math.Log1p(float64(tokens))/16
	if i := slices.Index(efforts[:], effort); i >= 0 {
		x[2+2*i], x[3+2*i] = 1, x[1]
	}
	return x
}

func dot(a, b [dimensions]float64) float64 {
	v := 0.0
	for i := range a {
		v += a[i] * b[i]
	}
	return v
}

func inverseMills(z float64) float64 {
	if z > 8 {
		return z + 1/z - 2/math.Pow(z, 3) + 10/math.Pow(z, 5)
	}
	return math.Exp(-z*z/2) / math.Sqrt(2*math.Pi) / max(1e-300, .5*math.Erfc(z/math.Sqrt2))
}
