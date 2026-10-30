export interface LoginViewProps {
  loginStep: 'password' | 'otp';
  password: string;
  onPasswordChange: (val: string) => void;
  onPasswordSubmit: () => void;
  email: string;
  onEmailChange: (val: string) => void;
  otp: string;
  onOtpChange: (val: string) => void;
  onOtpSubmit: () => void;
  onBackToPassword: () => void;
  otpSecondsLeft: number | null;
  isLoading: boolean;
  error: string | null;
}
