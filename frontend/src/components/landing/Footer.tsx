import { Link } from 'react-router-dom';
import { Github, Linkedin, Twitter } from 'lucide-react';
import AdaptiveSurface from '@/components/ui/AdaptiveSurface';
import BrandLogo from '@/components/branding/BrandLogo';

const footerGroups = [
  {
    title: 'Product',
    links: ['Monitoring', 'Attendance', 'Reports', 'Payroll'],
  },
  {
    title: 'Workspace',
    links: ['Projects', 'Tasks', 'Chat'],
  },
  {
    title: 'Admin',
    links: ['User Management', 'Invoices', 'Settings'],
  },
];

export default function Footer() {
  return (
    <footer className="px-4 pb-10 pt-6 sm:px-6 lg:px-8">
      <AdaptiveSurface
        className="mx-auto max-w-7xl rounded-[28px] border border-white/60 bg-white/88 px-5 py-7 shadow-[0_24px_70px_-46px_rgba(15,23,42,0.9)] backdrop-blur sm:rounded-[32px] sm:px-8 sm:py-8"
        tone="light"
        backgroundColor="rgba(255,255,255,0.88)"
      >
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <Link to="/" className="inline-flex w-full max-w-[16rem] items-center">
              <BrandLogo variant="full" size="sm" className="max-w-full" />
            </Link>
            <p className="mt-6 max-w-md text-sm leading-7 contrast-text-secondary">
              CareVance helps teams monitor work activity, manage attendance, review reports, run payroll workflows, and coordinate daily operations from one connected HRMS workspace.
            </p>
            <div className="mt-6 flex items-center gap-3 contrast-text-muted">
              {[Twitter, Linkedin, Github].map((Icon) => (
                <a
                  key={Icon.displayName || Icon.name}
                  href="/"
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 transition hover:border-slate-950 hover:text-slate-950"
                  aria-label={Icon.name}
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {footerGroups.map((group) => (
              <div key={group.title}>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] contrast-text-muted">{group.title}</p>
                <div className="mt-4 space-y-3">
                  {group.links.map((link) => (
                    <a key={link} href="/" className="block text-sm contrast-text-secondary transition hover:text-slate-950">
                      {link}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </AdaptiveSurface>
    </footer>
  );
}
