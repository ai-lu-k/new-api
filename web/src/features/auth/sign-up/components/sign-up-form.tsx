/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { z } from 'zod'

import { Dialog } from '@/components/dialog'
import { PasswordInput } from '@/components/password-input'
import { Turnstile } from '@/components/turnstile'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  register,
  sendRegistrationVerificationCode,
  verifyRegistrationCode,
  wechatLoginByCode,
} from '@/features/auth/api'
import { LegalConsent } from '@/features/auth/components/legal-consent'
import { OAuthProviders } from '@/features/auth/components/oauth-providers'
import {
  EMAIL_VERIFICATION_COUNTDOWN,
  registerFormSchema,
} from '@/features/auth/constants'
import { useAuthRedirect } from '@/features/auth/hooks/use-auth-redirect'
import { useEmailVerification } from '@/features/auth/hooks/use-email-verification'
import {
  isGeeTestUnavailable,
  useGeetest,
  type GeeTestSolution,
} from '@/features/auth/hooks/use-geetest'
import { useRegistrationRisk } from '@/features/auth/hooks/use-registration-risk'
import { useTurnstile } from '@/features/auth/hooks/use-turnstile'
import {
  getAffiliateCode,
  saveAffiliateCode,
} from '@/features/auth/lib/storage'
import { isLoginChallenge } from '@/features/auth/secure-verification/api'
import { useLegalVersion } from '@/features/legal/use-legal-version'
import { useCountdown } from '@/hooks/use-countdown'
import { useStatus } from '@/hooks/use-status'
import { isAuthBundle } from '@/lib/auth-session'
import { handleServerError } from '@/lib/handle-server-error'
import { AuthOperationError } from '@/lib/secure-verification'
import { createServerError } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

export function SignUpForm({
  className,
  onAuthenticated,
  ...props
}: React.HTMLAttributes<HTMLFormElement> & { onAuthenticated?: () => void }) {
  const risk = useRegistrationRisk()
  const queryClient = useQueryClient()
  const riskVerificationRequired = Boolean(risk.data?.required)
  const riskPaused = riskVerificationRequired && risk.data?.available === false
  const registrationReady = risk.isSuccess
  const { t } = useTranslation()
  const [isLoading, setIsLoading] = useState(false)
  const [verificationCode, setVerificationCode] = useState('')
  const [verificationCodeError, setVerificationCodeError] = useState('')
  const verificationCodeRef = useRef<HTMLInputElement>(null)
  const [riskSending, setRiskSending] = useState(false)
  const [riskFlow, setRiskFlow] = useState('')
  const [agreedLegalVersion, setAgreedLegalVersion] = useState<number | null>(
    null
  )
  const [wechatCode, setWeChatCode] = useState('')
  const [isWeChatDialogOpen, setIsWeChatDialogOpen] = useState(false)
  const [isWeChatSubmitting, setIsWeChatSubmitting] = useState(false)
  const [turnstileWidgetKey, setTurnstileWidgetKey] = useState(0)
  const legalConsentErrorMessage = t('Please agree to the legal terms first')

  const { status } = useStatus()
  const geetest = useGeetest(status?.geetest_captcha_id)
  const legal = useLegalVersion()
  const agreedToLegal =
    legal.version != null && agreedLegalVersion === legal.version.id
  const acceptance = {
    accepted: agreedToLegal,
    version_id: legal.version?.id ?? 0,
  }
  const {
    isTurnstileEnabled,
    turnstileSiteKey,
    turnstileToken,
    setTurnstileToken,
    validateTurnstile,
  } = useTurnstile()
  const { redirectToLogin, handleLoginResult } = useAuthRedirect()
  const {
    isSending: isSendingCode,
    secondsLeft,
    isActive,
    sendCode,
  } = useEmailVerification({
    turnstileToken,
    validateTurnstile,
  })
  const riskCountdown = useCountdown({
    initialSeconds: EMAIL_VERIFICATION_COUNTDOWN,
  })

  const form = useForm<z.infer<typeof registerFormSchema>>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: {
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
      aff_code:
        new URLSearchParams(window.location.search).get('aff')?.trim() ||
        getAffiliateCode(),
    },
  })

  const emailValue = form.watch('email')
  const emailVerificationRequired =
    !!status?.email_verification && !risk.data?.required
  const hasUserAgreement = legal.legalStatus.user_agreement_enabled
  const hasPrivacyPolicy = legal.legalStatus.privacy_policy_enabled
  const requiresLegalConsent = hasUserAgreement || hasPrivacyPolicy
  const oauthRegisterEnabled =
    status?.oauth_register_enabled ??
    status?.data?.oauth_register_enabled ??
    true
  const hasWeChatLogin = Boolean(status?.wechat_login)
  const turnstileReady = !isTurnstileEnabled || Boolean(turnstileToken)
  // Keep account details on the first step and verification on the second.
  const twoStepSignup =
    emailVerificationRequired || Boolean(risk.data?.required)
  const [step, setStep] = useState<1 | 2>(1)
  const onFirstStep = twoStepSignup && step === 1

  const wechatQrCodeUrl = useMemo(() => {
    return (
      status?.wechat_qrcode ||
      status?.wechat_qr_code ||
      status?.wechat_qrcode_image_url ||
      status?.wechat_qr_code_image_url ||
      status?.wechat_account_qrcode_image_url ||
      status?.WeChatAccountQRCodeImageURL ||
      status?.data?.wechat_qrcode ||
      status?.data?.WeChatAccountQRCodeImageURL ||
      ''
    )
  }, [status])

  // Keep the OAuth registration paths attributed as well: they read the stored
  // code, which follows the field the user can still edit.
  const affiliateCodeValue = form.watch('aff_code')
  useEffect(() => {
    const code = affiliateCodeValue?.trim()
    if (code) {
      saveAffiliateCode(code)
    }
  }, [affiliateCodeValue])

  async function onSubmit(data: z.infer<typeof registerFormSchema>) {
    if (!registrationReady) return
    if (!legal.isSuccess || (requiresLegalConsent && !agreedToLegal)) {
      toast.error(legalConsentErrorMessage)
      return
    }

    // Validate email verification if required. Both checks land under their
    // own field and take the focus, so a phone user is not left reading a toast
    // that names no input.
    if (emailVerificationRequired || riskVerificationRequired) {
      if (!data.email) {
        form.setError(
          'email',
          { type: 'manual', message: t('Please enter your email') },
          { shouldFocus: true }
        )
        return
      }
      if (!verificationCode) {
        setVerificationCodeError(t('Please enter the verification code'))
        verificationCodeRef.current?.focus()
        return
      }
    }

    if (!validateTurnstile()) return

    setIsLoading(true)
    try {
      if (riskVerificationRequired) {
        if (!riskFlow) {
          setVerificationCodeError(t('Please enter the verification code'))
          verificationCodeRef.current?.focus()
          return
        }
        const verified = await verifyRegistrationCode(
          riskFlow,
          verificationCode
        )
        if (!verified?.success) {
          setVerificationCodeError(t('Verification failed'))
          verificationCodeRef.current?.focus()
          return
        }
        void queryClient.invalidateQueries({ queryKey: ['registration-risk'] })
      }
      const inviteCode = data.aff_code?.trim()
      if (inviteCode) {
        saveAffiliateCode(inviteCode)
      }
      const res = await register({
        username: data.username,
        password: data.password,
        email: data.email || undefined,
        verification_code: emailVerificationRequired
          ? verificationCode || undefined
          : undefined,
        aff_code: inviteCode || undefined,
        turnstile: turnstileToken,
        legal_consent: acceptance,
      })

      if (res?.success) {
        if (isAuthBundle(res.data) || isLoginChallenge(res.data)) {
          if (await handleLoginResult(res.data, undefined, onAuthenticated)) {
            toast.success(t('Signed in successfully!'))
          }
        } else {
          // 兼容旧后端：注册成功但没带回会话。
          toast.success(t('Account created! Please sign in'))
          redirectToLogin()
        }
      } else {
        handleServerError(createServerError(res, t('Failed to create account')))
      }
    } catch (error) {
      handleServerError(
        AuthOperationError.from(error, t('Failed to create account'))
      )
    } finally {
      void queryClient.invalidateQueries({ queryKey: ['registration-risk'] })
      setIsLoading(false)
    }
  }

  async function handleSendVerificationCode() {
    if (riskVerificationRequired) {
      if (!emailValue) {
        toast.error(t('Please enter your email first'))
        return
      }
      setRiskSending(true)
      try {
        // The one human check guards the send; the emailed code is the only
        // thing the visitor has to type afterwards.
        let captcha: GeeTestSolution | undefined
        try {
          captcha = await geetest.verify()
        } catch (error) {
          // A provider that cannot load is the server's call to degrade; only
          // a visitor who closed the challenge is asked to try again.
          if (!isGeeTestUnavailable(error)) {
            toast.error(
              t('Human verification expired or failed. Please try again.')
            )
            return
          }
        }
        const res = await sendRegistrationVerificationCode(emailValue, captcha)
        const flowToken = res?.data?.flow_token
        if (!res?.success || !flowToken) {
          handleServerError(
            createServerError(res, t('Failed to send verification email'))
          )
          return
        }
        setRiskFlow(flowToken)
        riskCountdown.start()
        toast.success(t('Verification email sent'))
      } catch (error) {
        handleServerError(
          AuthOperationError.from(error, t('Failed to send verification email'))
        )
      } finally {
        setRiskSending(false)
      }
      return
    }
    if (await sendCode(emailValue || '')) {
      setTurnstileToken('')
      setTurnstileWidgetKey((current) => current + 1)
    }
  }

  const handleOpenWeChatDialog = () => {
    if (!legal.isSuccess || (requiresLegalConsent && !agreedToLegal)) {
      toast.error(legalConsentErrorMessage)
      return
    }

    setIsWeChatDialogOpen(true)
  }

  const handleWeChatDialogChange = (open: boolean) => {
    setIsWeChatDialogOpen(open)
    if (!open) {
      setWeChatCode('')
      setIsWeChatSubmitting(false)
    }
  }

  async function handleWeChatLogin() {
    if (!wechatCode.trim()) {
      toast.error(t('Please enter the verification code'))
      return
    }

    setIsWeChatSubmitting(true)
    try {
      const res = await wechatLoginByCode(wechatCode, acceptance)
      if (res?.success) {
        handleWeChatDialogChange(false)
        if (await handleLoginResult(res.data, undefined, onAuthenticated)) {
          toast.success(t('Signed in via WeChat'))
        }
      } else {
        handleServerError(createServerError(res, t('Login failed')))
      }
    } catch (error: unknown) {
      handleServerError(
        new AuthOperationError(t('Login failed'), undefined, { cause: error })
      )
    } finally {
      setIsWeChatSubmitting(false)
    }
  }

  function goToStep(next: 1 | 2) {
    setStep(next)
    // Keep keyboard users on the step they just opened.
    requestAnimationFrame(() => {
      form.setFocus(next === 1 ? 'username' : 'email')
    })
  }

  const submitBlocked =
    !registrationReady ||
    riskPaused ||
    !legal.isSuccess ||
    (requiresLegalConsent && !agreedToLegal) ||
    !turnstileReady

  const handleFormSubmit = form.handleSubmit(async (data) => {
    if (onFirstStep) {
      goToStep(2)
      return
    }
    await onSubmit(data)
  })

  const codeSendActive = riskVerificationRequired
    ? riskCountdown.isActive
    : isActive
  const codeSendPending = riskVerificationRequired ? riskSending : isSendingCode
  const codeSendSecondsLeft = riskVerificationRequired
    ? riskCountdown.secondsLeft
    : secondsLeft

  let verificationCodeAction: ReactNode = t('Send code')
  if (codeSendActive) {
    verificationCodeAction = t('Resend ({{seconds}}s)', {
      seconds: codeSendSecondsLeft,
    })
  } else if (codeSendPending) {
    verificationCodeAction = <Loader2 className='h-4 w-4 animate-spin' />
  }

  return (
    <Form {...form}>
      <form
        onSubmit={handleFormSubmit}
        className={cn('grid gap-4', className)}
        {...props}
      >
        <div
          className={cn(
            'grid content-start gap-4',
            isTurnstileEnabled ? 'min-h-[20.5rem]' : 'min-h-[14rem]'
          )}
        >
          {twoStepSignup && (
            <p className='sr-only' aria-live='polite'>
              {t('Step {{current}} of {{total}}', { current: step, total: 2 })}
            </p>
          )}

          {(!twoStepSignup || step === 1) && (
            <>
              {/* Username Field */}
              <FormField
                control={form.control}
                name='username'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Username')}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Password Field */}
              <FormField
                control={form.control}
                name='password'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Password (8–128 characters)')}</FormLabel>
                    <FormControl>
                      <PasswordInput {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Confirm Password Field */}
              <FormField
                control={form.control}
                name='confirmPassword'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Confirm password')}</FormLabel>
                    <FormControl>
                      <PasswordInput {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </>
          )}

          {(!twoStepSignup || step === 2) && (
            <>
              {/* Email Verification Section */}
              {(emailVerificationRequired || riskVerificationRequired) && (
                <>
                  {/* Email Field */}
                  <FormField
                    control={form.control}
                    name='email'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {t('Email (required for verification)')}
                        </FormLabel>
                        <FormControl>
                          <Input
                            type='email'
                            {...field}
                            onChange={(event) => {
                              field.onChange(event)
                              setRiskFlow('')
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Verification Code Field */}
                  <div className='grid gap-2'>
                    <Label htmlFor='verification-code'>
                      {t('Verification code')}
                    </Label>
                    <div className='flex items-center gap-2'>
                      <Input
                        ref={verificationCodeRef}
                        id='verification-code'
                        className='min-w-0 flex-1'
                        aria-invalid={Boolean(verificationCodeError)}
                        aria-describedby={
                          verificationCodeError
                            ? 'verification-code-error'
                            : undefined
                        }
                        value={verificationCode}
                        onChange={(e) => {
                          setVerificationCode(e.target.value)
                          if (verificationCodeError) {
                            setVerificationCodeError('')
                          }
                        }}
                      />
                      <Button
                        className='shrink-0'
                        variant='outline'
                        type='button'
                        disabled={
                          isLoading ||
                          riskPaused ||
                          codeSendPending ||
                          codeSendActive ||
                          !emailValue ||
                          (!riskVerificationRequired && !turnstileReady)
                        }
                        onClick={handleSendVerificationCode}
                      >
                        {verificationCodeAction}
                      </Button>
                    </div>
                    {verificationCodeError ? (
                      <FieldError id='verification-code-error'>
                        {verificationCodeError}
                      </FieldError>
                    ) : null}
                    {riskPaused ? (
                      <p
                        className='text-muted-foreground text-xs'
                        role='status'
                      >
                        {t(
                          'Human verification is temporarily unavailable. Registration is paused. Please try again later.'
                        )}
                      </p>
                    ) : null}
                  </div>
                </>
              )}

              {/* Turnstile */}
              {isTurnstileEnabled && (
                <div className='mt-2'>
                  <Turnstile
                    key={turnstileWidgetKey}
                    siteKey={turnstileSiteKey}
                    onVerify={setTurnstileToken}
                  />
                </div>
              )}

              <FormField
                control={form.control}
                name='aff_code'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Invite code (optional)')}</FormLabel>
                    <FormControl>
                      <Input autoComplete='off' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </>
          )}
        </div>

        <LegalConsent
          status={legal.legalStatus}
          version={legal.version}
          checked={agreedToLegal}
          onCheckedChange={(checked) =>
            setAgreedLegalVersion(checked ? (legal.version?.id ?? null) : null)
          }
          isLoading={legal.isPending}
          hasError={legal.isError}
          onRetry={() => {
            void legal.refetch()
          }}
          className='mt-1'
        />

        {/* Step actions */}
        <div className='mt-2 flex gap-2'>
          {twoStepSignup && step === 2 && (
            <Button
              type='button'
              variant='outline'
              className='flex-1'
              onClick={() => goToStep(1)}
              disabled={isLoading}
            >
              {t('Back')}
            </Button>
          )}
          <Button
            type='submit'
            className='flex-1 justify-center gap-2'
            disabled={isLoading || (!onFirstStep && submitBlocked)}
          >
            {isLoading ? <Loader2 className='h-4 w-4 animate-spin' /> : null}
            {onFirstStep ? t('Next') : t('Create account')}
          </Button>
        </div>

        {oauthRegisterEnabled && (
          <OAuthProviders
            legalAcceptance={acceptance}
            status={status}
            onRegistrationVerification={
              onFirstStep && risk.data?.required && !risk.data.verified
                ? () => goToStep(2)
                : undefined
            }
            disabled={
              isLoading ||
              !registrationReady ||
              !legal.isSuccess ||
              (requiresLegalConsent && !agreedToLegal)
            }
            onWeChatLogin={hasWeChatLogin ? handleOpenWeChatDialog : undefined}
            isWeChatLoading={isWeChatSubmitting}
            className='pt-2'
          />
        )}
      </form>

      {hasWeChatLogin && (
        <Dialog
          open={isWeChatDialogOpen}
          onOpenChange={handleWeChatDialogChange}
          title={t('WeChat sign in')}
          description={t(
            'Scan the QR code to follow the official account and reply with “验证码” to receive your verification code.'
          )}
          contentClassName='max-w-sm'
          headerClassName='text-left'
          contentHeight='auto'
          bodyClassName='space-y-4'
          footer={
            <>
              <Button
                type='button'
                variant='outline'
                onClick={() => handleWeChatDialogChange(false)}
                disabled={isWeChatSubmitting}
              >
                {t('Cancel')}
              </Button>
              <Button
                type='button'
                onClick={handleWeChatLogin}
                disabled={
                  isWeChatSubmitting ||
                  !wechatCode.trim() ||
                  (requiresLegalConsent && !agreedToLegal)
                }
                className='gap-2'
              >
                {isWeChatSubmitting ? (
                  <Loader2 className='h-4 w-4 animate-spin' />
                ) : null}
                {t('Confirm')}
              </Button>
            </>
          }
        >
          {wechatQrCodeUrl ? (
            <div className='flex justify-center'>
              <img
                src={wechatQrCodeUrl}
                alt={t('WeChat login QR code')}
                className='h-40 w-40 rounded-md border object-contain'
              />
            </div>
          ) : (
            <p className='text-muted-foreground text-sm'>
              {t('QR code is not configured. Please contact support.')}
            </p>
          )}
          <div className='grid gap-2'>
            <Label htmlFor='wechat-code'>{t('Verification code')}</Label>
            <Input
              id='wechat-code'
              value={wechatCode}
              onChange={(event) => setWeChatCode(event.target.value)}
              autoComplete='one-time-code'
            />
          </div>
        </Dialog>
      )}
    </Form>
  )
}
