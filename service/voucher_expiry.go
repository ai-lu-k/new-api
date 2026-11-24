package service

import (
	"fmt"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

const voucherExpiryInterval = time.Hour

// StartVoucherExpiry lapses vouchers whose deadline passed. Only the master
// instance sweeps; the sweep only ever moves an unopened voucher to expired, so
// running it twice is harmless.
func StartVoucherExpiry() {
	if !common.IsMasterNode {
		return
	}
	go func() {
		expireVouchers()
		ticker := time.NewTicker(voucherExpiryInterval)
		defer ticker.Stop()
		for range ticker.C {
			expireVouchers()
		}
	}()
}

func expireVouchers() {
	expired, err := model.ExpireVouchers(time.Now())
	if err != nil {
		common.SysError("failed to expire vouchers: " + err.Error())
		return
	}
	if expired > 0 {
		common.SysLog(fmt.Sprintf("expired unopened vouchers: %d", expired))
	}
}
