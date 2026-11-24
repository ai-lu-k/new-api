// relay-latency replays content-free observations without connecting to a
// database or changing live timeout policies.
package main

import (
	"bufio"
	"flag"
	"fmt"
	"os"
	"slices"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/pkg/relaylatency"
)

type observation struct {
	Channel      int    `json:"channel_id"`
	Model        string `json:"upstream_model"`
	At           int64  `json:"observed_at"`
	Effort       string `json:"effort"`
	Tokens       int    `json:"input_tokens"`
	Milliseconds int64  `json:"elapsed_ms"`
	Censored     bool   `json:"censored"`
}

type key struct {
	Channel int
	Model   string
}
type result struct {
	Channel  int                    `json:"channel_id"`
	Model    string                 `json:"upstream_model"`
	Samples  int                    `json:"samples"`
	Function *relaylatency.Function `json:"function,omitempty"`
	Rejected string                 `json:"rejected,omitempty"`
}

func main() {
	input := flag.String("input", "", "Content-free observation JSONL file")
	output := flag.String("output", "", "Write the replay report here")
	minimum := flag.Int("minimum", 500, "Minimum observations per channel/upstream model")
	cutoff := flag.String("cutoff", "", "Exclusive RFC3339 window end; preceding seven days are used")
	flag.Parse()
	if *input == "" || *output == "" || *cutoff == "" {
		fmt.Fprintln(os.Stderr, "usage: relay-latency -input observations.jsonl -output report.json -cutoff RFC3339")
		os.Exit(2)
	}
	end, err := time.Parse(time.RFC3339, *cutoff)
	if err != nil {
		fmt.Fprintln(os.Stderr, "invalid cutoff")
		os.Exit(2)
	}
	file, err := os.Open(*input)
	if err != nil {
		fmt.Fprintln(os.Stderr, "cannot open input")
		os.Exit(1)
	}
	defer file.Close()
	groups := make(map[key][]relaylatency.Sample)
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 4096), 65536)
	for scanner.Scan() {
		var row observation
		if err := common.Unmarshal(scanner.Bytes(), &row); err != nil || row.Channel <= 0 || row.Model == "" || len(row.Model) > 200 {
			fmt.Fprintln(os.Stderr, "invalid observation")
			os.Exit(1)
		}
		if row.At < end.AddDate(0, 0, -7).Unix() || row.At >= end.Unix() {
			continue
		}
		k := key{row.Channel, row.Model}
		groups[k] = append(groups[k], relaylatency.Sample{At: row.At, Effort: row.Effort, InputTokens: row.Tokens, Milliseconds: row.Milliseconds, Censored: row.Censored})
	}
	if scanner.Err() != nil {
		fmt.Fprintln(os.Stderr, "cannot read observation file")
		os.Exit(1)
	}
	var results []result
	for k, samples := range groups {
		r := result{Channel: k.Channel, Model: k.Model, Samples: len(samples)}
		f, err := relaylatency.Fit(samples, .99, *minimum)
		if err != nil {
			r.Rejected = err.Error()
		} else {
			r.Function = &f
		}
		results = append(results, r)
	}
	slices.SortFunc(results, func(a, b result) int {
		if a.Channel < b.Channel {
			return -1
		}
		if a.Channel > b.Channel {
			return 1
		}
		if a.Model < b.Model {
			return -1
		}
		if a.Model > b.Model {
			return 1
		}
		return 0
	})
	data, err := common.Marshal(map[string]any{"cutoff": end.Format(time.RFC3339), "window_days": 7, "results": results})
	if err != nil || os.WriteFile(*output, append(data, '\n'), 0600) != nil {
		fmt.Fprintln(os.Stderr, "cannot write report")
		os.Exit(1)
	}
	fmt.Printf("replayed %d channel/upstream-model groups\n", len(results))
}
