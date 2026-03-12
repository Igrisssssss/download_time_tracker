import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import type { NavGroup } from '@/navigation/dashboardNavigation';

interface TopNavigationProps {
  groups: NavGroup[];
  mobile?: boolean;
  onNavigate?: () => void;
  onOpenExternal?: (path: string) => void;
}

const isPathMatch = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

export default function TopNavigation({
  groups,
  mobile = false,
  onNavigate,
  onOpenExternal,
}: TopNavigationProps) {
  const location = useLocation();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [dropdownStyle, setDropdownStyle] = useState<{ top: number; left: number; width: number } | null>(null);
  const navRef = useRef<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (navRef.current?.contains(target) || dropdownRef.current?.contains(target)) {
        return;
      }

      if (!navRef.current?.contains(target)) {
        setOpenGroup(null);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenGroup(null);
      }
    };

    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  useEffect(() => {
    setOpenGroup(null);
  }, [location.pathname]);

  useEffect(() => {
    if (mobile) return;

    const handleScroll = () => {
      setOpenGroup(null);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [mobile]);

  useEffect(() => {
    if (mobile || !openGroup) {
      setDropdownStyle(null);
      return;
    }

    const updateDropdownPosition = () => {
      const trigger = triggerRefs.current[openGroup];
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const width = Math.min(320, window.innerWidth - 16);
      const left = Math.max(8, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 8));

      setDropdownStyle({
        top: rect.bottom + 12,
        left,
        width,
      });
    };

    updateDropdownPosition();
    window.addEventListener('resize', updateDropdownPosition);
    return () => window.removeEventListener('resize', updateDropdownPosition);
  }, [mobile, openGroup]);

  const activeGroup = useMemo(
    () =>
      groups.find((group) =>
        group.to
          ? isPathMatch(location.pathname, group.to)
          : (group.items || []).some((item) => isPathMatch(location.pathname, item.to))
      )?.label ?? null,
    [groups, location.pathname]
  );

  return (
    <div ref={navRef} className={mobile ? 'w-full' : 'relative hidden max-w-full lg:block'}>
      <nav
        aria-label="Primary"
        className={
          mobile
            ? 'flex w-full flex-col gap-2'
            : 'flex max-w-full flex-wrap items-center justify-center gap-2 rounded-full border border-white/85 bg-white/72 p-2 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.45)]'
        }
      >
        {groups.map((group) => {
          const isActive = activeGroup === group.label;
          if (group.items?.length) {
            const expanded = openGroup === group.label;

            return (
              <div key={group.label} className={mobile ? 'w-full' : 'relative'}>
                <button
                  ref={(element) => {
                    triggerRefs.current[group.label] = element;
                  }}
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={expanded}
                  onClick={() => setOpenGroup((current) => (current === group.label ? null : group.label))}
                  className={`inline-flex items-center gap-2 text-sm font-medium transition ${
                    isActive || expanded
                      ? 'bg-slate-950 text-white shadow-[0_18px_38px_-26px_rgba(15,23,42,0.8)]'
                      : 'text-slate-600 hover:bg-white hover:text-slate-950'
                  } ${
                    mobile
                      ? 'w-full justify-between rounded-[20px] border border-slate-200/80 px-4 py-3.5'
                      : 'rounded-full px-5 py-3'
                  }`}
                >
                  <group.icon className="h-4 w-4" />
                  <span>{group.label}</span>
                  <ChevronDown className={`h-4 w-4 transition ${expanded ? 'rotate-180' : ''}`} />
                </button>

                {expanded ? (
                  <>
                    {mobile ? (
                      <div role="menu" className="mt-2 space-y-1 rounded-[24px] border border-slate-200/80 bg-white/92 p-2 shadow-[0_20px_50px_-36px_rgba(15,23,42,0.45)]">
                        {group.items.map((item) => {
                          const itemActive = isPathMatch(location.pathname, item.to);
                          const description =
                            group.label === 'Reports'
                              ? 'Detailed analytics and exports'
                              : group.label === 'Attendance'
                                ? item.label === 'Monitoring'
                                  ? 'Live time and activity tracking'
                                  : 'Attendance and time workflows'
                                : 'Workspace and admin controls';

                          const itemClassName = `flex items-start gap-3 rounded-[20px] px-3 py-3 text-sm transition ${
                            itemActive ? 'bg-sky-50 text-sky-800' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
                          }`;

                          return item.external ? (
                            <button
                              key={item.to}
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                onOpenExternal?.(item.externalPath || item.to);
                                setOpenGroup(null);
                                onNavigate?.();
                              }}
                              className={`${itemClassName} w-full text-left`}
                            >
                              <item.icon className={`mt-0.5 h-4 w-4 shrink-0 ${itemActive ? 'text-sky-700' : 'text-slate-400'}`} />
                              <div>
                                <p className="font-medium">{item.label}</p>
                                <p className="text-xs text-slate-500">{description}</p>
                              </div>
                            </button>
                          ) : (
                            <Link
                              key={item.to}
                              to={item.to}
                              role="menuitem"
                              onClick={() => {
                                setOpenGroup(null);
                                onNavigate?.();
                              }}
                              className={itemClassName}
                            >
                              <item.icon className={`mt-0.5 h-4 w-4 shrink-0 ${itemActive ? 'text-sky-700' : 'text-slate-400'}`} />
                              <div>
                                <p className="font-medium">{item.label}</p>
                                <p className="text-xs text-slate-500">{description}</p>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    ) : dropdownStyle ? createPortal(
                      <div
                        ref={dropdownRef}
                        role="menu"
                        className="fixed z-[120] max-h-[min(70vh,32rem)] overflow-y-auto overscroll-contain rounded-[24px] border border-white/80 bg-white/95 p-2 shadow-[0_32px_90px_-48px_rgba(15,23,42,0.55)] backdrop-blur-2xl"
                        style={{
                          top: `${dropdownStyle.top}px`,
                          left: `${dropdownStyle.left}px`,
                          width: `${dropdownStyle.width}px`,
                        }}
                      >
                        {group.items.map((item) => {
                          const itemActive = isPathMatch(location.pathname, item.to);
                          const description =
                            group.label === 'Reports'
                              ? 'Detailed analytics and exports'
                              : group.label === 'Attendance'
                                ? item.label === 'Monitoring'
                                  ? 'Live time and activity tracking'
                                  : 'Attendance and time workflows'
                                : 'Workspace and admin controls';

                          const itemClassName = `flex items-start gap-3 rounded-[20px] px-3 py-3 text-sm transition ${
                            itemActive ? 'bg-sky-50 text-sky-800' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
                          }`;

                          return item.external ? (
                            <button
                              key={item.to}
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                onOpenExternal?.(item.externalPath || item.to);
                                setOpenGroup(null);
                                onNavigate?.();
                              }}
                              className={`${itemClassName} w-full text-left`}
                            >
                              <item.icon className={`mt-0.5 h-4 w-4 shrink-0 ${itemActive ? 'text-sky-700' : 'text-slate-400'}`} />
                              <div>
                                <p className="font-medium">{item.label}</p>
                                <p className="text-xs text-slate-500">{description}</p>
                              </div>
                            </button>
                          ) : (
                            <Link
                              key={item.to}
                              to={item.to}
                              role="menuitem"
                              onClick={() => {
                                setOpenGroup(null);
                                onNavigate?.();
                              }}
                              className={itemClassName}
                            >
                              <item.icon className={`mt-0.5 h-4 w-4 shrink-0 ${itemActive ? 'text-sky-700' : 'text-slate-400'}`} />
                              <div>
                                <p className="font-medium">{item.label}</p>
                                <p className="text-xs text-slate-500">{description}</p>
                              </div>
                            </Link>
                          );
                        })}
                      </div>,
                      document.body
                    ) : null}
                  </>
                ) : null}
              </div>
            );
          }

          return (
            group.external ? (
              <button
                key={group.label}
                type="button"
                onClick={() => {
                  onOpenExternal?.(group.externalPath || group.to || '/dashboard');
                  onNavigate?.();
                }}
                className={`inline-flex items-center gap-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-slate-950 text-white shadow-[0_18px_38px_-26px_rgba(15,23,42,0.8)]'
                    : 'text-slate-600 hover:bg-white hover:text-slate-950'
                } ${
                  mobile
                    ? 'w-full justify-start rounded-[20px] border border-slate-200/80 px-4 py-3.5'
                    : 'rounded-full px-5 py-3'
                }`}
              >
                <group.icon className="h-4 w-4" />
                <span>{group.label}</span>
              </button>
            ) : (
              <Link
                key={group.label}
                to={group.to || '/dashboard'}
                onClick={onNavigate}
                className={`inline-flex items-center gap-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-slate-950 text-white shadow-[0_18px_38px_-26px_rgba(15,23,42,0.8)]'
                    : 'text-slate-600 hover:bg-white hover:text-slate-950'
                } ${
                  mobile
                    ? 'w-full justify-start rounded-[20px] border border-slate-200/80 px-4 py-3.5'
                    : 'rounded-full px-5 py-3'
                }`}
              >
                <group.icon className="h-4 w-4" />
                <span>{group.label}</span>
              </Link>
            )
          );
        })}
      </nav>
    </div>
  );
}
