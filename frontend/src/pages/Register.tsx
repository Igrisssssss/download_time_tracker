import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  Monitor,
  ShieldCheck,
  User,
  Users,
} from 'lucide-react';
import AdaptiveSurface from '@/components/ui/AdaptiveSurface';
import BrandLogo from '@/components/branding/BrandLogo';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
const API_BASE_URL = API_URL.replace(/\/api\/?$/, '');
const DEFAULT_DESKTOP_DOWNLOAD_URL = `${API_BASE_URL}/api/downloads/desktop/windows`;
const DEFAULT_DESKTOP_DOWNLOAD_LABEL = 'Download for Windows';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'employee'>('admin');
  const [organizationName, setOrganizationName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();
  const desktopDownloadUrl = import.meta.env.VITE_DESKTOP_DOWNLOAD_URL?.trim() || DEFAULT_DESKTOP_DOWNLOAD_URL;
  const desktopDownloadLabel = import.meta.env.VITE_DESKTOP_DOWNLOAD_LABEL?.trim() || DEFAULT_DESKTOP_DOWNLOAD_LABEL;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);

    try {
      await register(name, email, password, {
        role,
        organizationName,
      });
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#fcfdff_0%,#f2f8ff_26%,#eef5ff_56%,#f8fafc_100%)] text-slate-950">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(circle_at_top,rgba(125,211,252,0.32),transparent_58%)]" />
      <div className="pointer-events-none absolute -left-16 top-28 h-72 w-72 rounded-full bg-sky-200/40 blur-3xl" />
      <div className="pointer-events-none absolute right-[-6rem] top-40 h-[28rem] w-[28rem] rounded-full bg-cyan-200/25 blur-3xl" />
      <div className="hero-grid pointer-events-none absolute inset-0 opacity-55" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-[1600px] flex-col lg:flex-row">
        <section className="order-1 flex w-full items-center justify-center px-4 py-10 sm:px-6 lg:w-1/2 lg:px-10">
          <div className="w-full max-w-lg animate-fade-in">
            <AdaptiveSurface
              className="glass-panel premium-ring rounded-[34px] p-6 shadow-[0_40px_120px_-56px_rgba(15,23,42,0.45)] sm:p-8"
              tone="light"
              backgroundColor="rgba(255,255,255,0.8)"
            >
              <div className="mb-6">
                <div className="mb-6 flex items-center">
                  <Link
                    to="/"
                    aria-label="Back to home"
                    className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200/80 bg-white/80 text-slate-600 shadow-[0_16px_35px_-24px_rgba(15,23,42,0.25)] backdrop-blur-xl transition duration-300 hover:-translate-y-0.5 hover:border-slate-950 hover:text-slate-950"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Link>
                </div>
                <BrandLogo variant="full" size="sm" className="mb-5 max-w-[16rem]" />
                <h1 className="mt-3 text-4xl font-semibold tracking-[-0.06em] text-slate-950 sm:text-[3.2rem] sm:leading-[0.95]">
                  Create your account
                </h1>
                <p className="mt-4 text-base leading-8 text-slate-600">
                  Set up your workspace to access monitoring, attendance, reporting, payroll, and internal operations modules from one place.
                </p>
                <p className="mt-3 text-sm text-slate-500">
                  Already have an account?{' '}
                  <Link
                    to="/login"
                    className="font-semibold text-sky-700 underline-offset-4 transition hover:text-slate-950 hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
                  >
                    Sign in
                  </Link>
                </p>
              </div>

              {error && (
                <div className="mb-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50/90 p-4">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <form className="space-y-5" onSubmit={handleSubmit}>
                <div>
                  <label htmlFor="name" className="mb-2 block text-sm font-semibold text-slate-800">
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="name"
                      name="name"
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="block w-full rounded-[22px] border border-slate-200/90 bg-white/85 py-4 pl-12 pr-4 text-sm text-slate-950 placeholder-slate-400 shadow-[0_14px_30px_-24px_rgba(15,23,42,0.22)] transition duration-300 outline-none focus:border-sky-300/90 focus:bg-white focus:ring-2 focus:ring-sky-300/30"
                      placeholder="John Doe"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="role" className="mb-2 block text-sm font-semibold text-slate-800">
                    Account Type
                  </label>
                  <div className="relative">
                    <Users className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <select
                      id="role"
                      value={role}
                      onChange={(e) => setRole(e.target.value as 'admin' | 'employee')}
                      className="block w-full appearance-none rounded-[22px] border border-slate-200/90 bg-white/85 py-4 pl-12 pr-4 text-sm text-slate-950 shadow-[0_14px_30px_-24px_rgba(15,23,42,0.22)] transition duration-300 outline-none focus:border-sky-300/90 focus:bg-white focus:ring-2 focus:ring-sky-300/30"
                    >
                      <option value="admin">Admin</option>
                      <option value="employee">Employee</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="organization" className="mb-2 block text-sm font-semibold text-slate-800">
                    {role === 'admin' ? 'Organization Name' : 'Organization Name (To Join)'}
                  </label>
                  <div className="relative">
                    <Monitor className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="organization"
                      name="organization"
                      type="text"
                      required
                      value={organizationName}
                      onChange={(e) => setOrganizationName(e.target.value)}
                      className="block w-full rounded-[22px] border border-slate-200/90 bg-white/85 py-4 pl-12 pr-4 text-sm text-slate-950 placeholder-slate-400 shadow-[0_14px_30px_-24px_rgba(15,23,42,0.22)] transition duration-300 outline-none focus:border-sky-300/90 focus:bg-white focus:ring-2 focus:ring-sky-300/30"
                      placeholder={role === 'admin' ? 'Acme Inc.' : 'Enter existing organization name'}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="email" className="mb-2 block text-sm font-semibold text-slate-800">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="block w-full rounded-[22px] border border-slate-200/90 bg-white/85 py-4 pl-12 pr-4 text-sm text-slate-950 placeholder-slate-400 shadow-[0_14px_30px_-24px_rgba(15,23,42,0.22)] transition duration-300 outline-none focus:border-sky-300/90 focus:bg-white focus:ring-2 focus:ring-sky-300/30"
                      placeholder="you@example.com"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className="mb-2 block text-sm font-semibold text-slate-800">
                    Password
                  </label>
                  <div className="relative">
                    <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="block w-full rounded-[22px] border border-slate-200/90 bg-white/85 py-4 pl-12 pr-12 text-sm text-slate-950 placeholder-slate-400 shadow-[0_14px_30px_-24px_rgba(15,23,42,0.22)] transition duration-300 outline-none focus:border-sky-300/90 focus:bg-white focus:ring-2 focus:ring-sky-300/30"
                      placeholder="********"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 flex items-center pr-4 text-slate-400 transition hover:text-slate-700 focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="confirm-password" className="mb-2 block text-sm font-semibold text-slate-800">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="confirm-password"
                      name="confirm-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="block w-full rounded-[22px] border border-slate-200/90 bg-white/85 py-4 pl-12 pr-4 text-sm text-slate-950 placeholder-slate-400 shadow-[0_14px_30px_-24px_rgba(15,23,42,0.22)] transition duration-300 outline-none focus:border-sky-300/90 focus:bg-white focus:ring-2 focus:ring-sky-300/30"
                      placeholder="********"
                    />
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <input
                    id="terms"
                    name="terms"
                    type="checkbox"
                    required
                    className="mt-1 h-4 w-4 rounded border-slate-300 bg-white text-sky-600 focus:ring-sky-400"
                  />
                  <label htmlFor="terms" className="text-sm leading-6 text-slate-600">
                    I agree to the{' '}
                    <a href="#" className="font-semibold text-sky-700 transition hover:text-slate-950">
                      Terms of Service
                    </a>{' '}
                    and{' '}
                    <a href="#" className="font-semibold text-sky-700 transition hover:text-slate-950">
                      Privacy Policy
                    </a>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,#020617_0%,#0f172a_30%,#0284c7_100%)] px-5 py-4 text-sm font-semibold text-white shadow-[0_22px_50px_-18px_rgba(14,165,233,0.6)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_28px_58px_-20px_rgba(14,165,233,0.7)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoading ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Creating account...
                    </>
                  ) : (
                    <>
                      Create account
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </button>
              </form>

              {desktopDownloadUrl ? (
                <div className="mt-7 rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.88))] p-5 shadow-[0_22px_50px_-34px_rgba(15,23,42,0.32)]">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-11 w-11 items-center justify-center rounded-[18px] bg-slate-950 text-white shadow-[0_16px_32px_-18px_rgba(15,23,42,0.45)]">
                      <Download className="h-4 w-4" />
                    </div>
                    <div className="flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-700">Desktop Tracker</p>
                      <h3 className="mt-2 text-base font-semibold text-slate-950">Download the Windows app after setup</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        Use the desktop app for screenshot capture, idle detection, and timer sync with the web dashboard.
                      </p>
                      <a
                        href={desktopDownloadUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-300/80 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition duration-300 hover:-translate-y-0.5 hover:border-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
                      >
                        <Download className="h-3.5 w-3.5" />
                        {desktopDownloadLabel}
                      </a>
                    </div>
                  </div>
                </div>
              ) : null}
            </AdaptiveSurface>
          </div>
        </section>

        <section className="order-2 relative flex w-full overflow-hidden px-4 py-10 sm:px-6 lg:w-1/2 lg:px-10">
          <div className="relative z-10 my-auto w-full">
            <div className="glass-panel premium-ring noise-overlay relative overflow-hidden rounded-[36px] p-6 shadow-[0_50px_140px_-56px_rgba(14,165,233,0.4)] sm:p-8">
              <div className="absolute inset-x-0 top-0 h-44 bg-[radial-gradient(circle_at_top,rgba(125,211,252,0.28),transparent_70%)]" />
              <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.74),rgba(239,246,255,0.68))]" />
              <div className="relative">
                <h2 className="max-w-2xl text-4xl font-semibold leading-[0.97] tracking-[-0.06em] text-slate-950 sm:text-[3.5rem]">
                  Set up your workspace and start using the real HRMS modules.
                </h2>
                <p className="mt-5 max-w-2xl text-base leading-8 text-slate-600 sm:text-[1.08rem]">
                  Create an admin account to launch a new organization, or join an existing one as an employee and connect directly to the same dashboards, reports, monitoring, and operational workflows.
                </p>

                <ul className="mt-9 grid gap-4 sm:grid-cols-2">
                  <li className="glass-panel premium-ring rounded-[28px] px-5 py-5">
                    <Users className="mb-3 h-5 w-5 text-sky-700" />
                    <p className="text-lg font-semibold tracking-[-0.04em] text-slate-950">Workspace Setup</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">Create an organization as admin or join an existing workspace as an employee.</p>
                  </li>
                  <li className="glass-panel premium-ring rounded-[28px] px-5 py-5">
                    <Clock className="mb-3 h-5 w-5 text-sky-700" />
                    <p className="text-lg font-semibold tracking-[-0.04em] text-slate-950">Attendance + Timer</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">Track shifts, daily entries, and work sessions from the same account.</p>
                  </li>
                  <li className="glass-panel premium-ring rounded-[28px] px-5 py-5">
                    <BarChart3 className="mb-3 h-5 w-5 text-sky-700" />
                    <p className="text-lg font-semibold tracking-[-0.04em] text-slate-950">Monitoring + Reports</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">Open access to activity logs, screenshots, rankings, and exportable reports.</p>
                  </li>
                  <li className="glass-panel premium-ring rounded-[28px] px-5 py-5">
                    <ShieldCheck className="mb-3 h-5 w-5 text-sky-700" />
                    <p className="text-lg font-semibold tracking-[-0.04em] text-slate-950">Admin Controls</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">Manage users, approvals, payroll workflows, invoices, and internal communications.</p>
                  </li>
                </ul>

                <AdaptiveSurface
                  className="mt-8 rounded-[30px] border border-slate-200/80 bg-[linear-gradient(180deg,#06111f_0%,#020617_100%)] p-5 text-white shadow-[0_36px_90px_-42px_rgba(15,23,42,0.8)]"
                  tone="dark"
                  backgroundColor="#020617"
                >
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="contrast-text-accent text-xs font-semibold uppercase tracking-[0.3em]">Account Flow</p>
                      <p className="contrast-text-primary mt-2 text-lg font-semibold tracking-[-0.04em]">Three steps from signup to daily use</p>
                    </div>
                    <div className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold contrast-text-secondary">
                      Admin or employee
                    </div>
                  </div>
                  <div className="space-y-3">
                    {[
                      ['01', 'Create your account', 'Choose admin to start an organization or employee to join an existing team.'],
                      ['02', 'Connect your workspace', 'Link your organization so dashboards, attendance, and permissions are available immediately.'],
                      ['03', 'Start tracking work', 'Use the web app and optional Windows tracker for time, monitoring, and reports.'],
                    ].map(([step, title, description]) => (
                      <div key={step} className="flex gap-3 rounded-[24px] border border-white/10 bg-white/5 px-4 py-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-cyan-400/15 text-sm font-semibold text-cyan-200">
                          {step}
                        </div>
                        <div>
                          <p className="contrast-text-primary text-sm font-semibold">{title}</p>
                          <p className="contrast-text-secondary mt-1 text-sm leading-6">{description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="contrast-text-secondary mt-4 max-w-2xl text-sm leading-6">
                    After registration, you land in the dashboard and can continue with attendance, reports, payroll, approvals, and related workflows.
                  </p>
                </AdaptiveSurface>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
