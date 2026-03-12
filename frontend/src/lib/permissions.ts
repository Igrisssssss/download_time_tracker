import type { User } from '@/types';

export const hasAdminAccess = (user: User | null | undefined): boolean =>
  Boolean(user && (user.role === 'admin' || user.role === 'manager'));

export const isEmployeeUser = (user: User | null | undefined): boolean =>
  user?.role === 'employee';
