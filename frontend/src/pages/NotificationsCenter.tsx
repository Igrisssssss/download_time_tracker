import { useEffect, useMemo, useState } from 'react';
import { notificationApi, userApi } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { hasAdminAccess } from '@/lib/permissions';
import type { AppNotificationItem } from '@/types';
import PageHeader from '@/components/dashboard/PageHeader';
import SurfaceCard from '@/components/dashboard/SurfaceCard';
import Button from '@/components/ui/Button';
import { FeedbackBanner, PageEmptyState, PageLoadingState } from '@/components/ui/PageState';
import { FieldLabel, SelectInput, TextInput, TextareaInput } from '@/components/ui/FormField';
import { BellRing, Send } from 'lucide-react';

export default function NotificationsCenter() {
  const { user } = useAuth();
  const isAdmin = hasAdminAccess(user);
  const [notifications, setNotifications] = useState<AppNotificationItem[]>([]);
  const [users, setUsers] = useState<Array<{ id: number; name: string; email: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [query, setQuery] = useState('');
  const [publishType, setPublishType] = useState<'announcement' | 'news'>('announcement');
  const [publishTitle, setPublishTitle] = useState('');
  const [publishMessage, setPublishMessage] = useState('');
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<number[]>([]);

  const load = async () => {
    setIsLoading(true);
    try {
      const [notificationResponse, usersResponse] = await Promise.all([
        notificationApi.list({
          limit: 100,
          type: typeFilter || undefined,
          q: query || undefined,
          unread_only: statusFilter === 'unread',
        }),
        isAdmin ? userApi.getAll({ period: 'all' }) : Promise.resolve({ data: [] }),
      ]);

      let nextNotifications = notificationResponse.data?.data || [];
      if (statusFilter === 'read') {
        nextNotifications = nextNotifications.filter((item) => item.is_read);
      }

      setNotifications(nextNotifications);
      setUsers((usersResponse.data || []).map((item: any) => ({ id: item.id, name: item.name, email: item.email })));
    } catch (error: any) {
      setFeedback({ tone: 'error', message: error?.response?.data?.message || 'Failed to load notifications.' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [typeFilter, statusFilter, query]);

  const unreadCount = useMemo(() => notifications.filter((item) => !item.is_read).length, [notifications]);

  const markRead = async (id: number) => {
    try {
      await notificationApi.markRead(id);
      setNotifications((prev) => prev.map((item) => (item.id === id ? { ...item, is_read: true } : item)));
    } catch (error: any) {
      setFeedback({ tone: 'error', message: error?.response?.data?.message || 'Failed to mark notification as read.' });
    }
  };

  const markAllRead = async () => {
    try {
      await notificationApi.markAllRead();
      setNotifications((prev) => prev.map((item) => ({ ...item, is_read: true })));
      setFeedback({ tone: 'success', message: 'All notifications marked as read.' });
    } catch (error: any) {
      setFeedback({ tone: 'error', message: error?.response?.data?.message || 'Failed to mark notifications as read.' });
    }
  };

  const publish = async () => {
    if (!publishTitle.trim() || !publishMessage.trim()) {
      setFeedback({ tone: 'error', message: 'Title and message are required to publish a notification.' });
      return;
    }

    try {
      await notificationApi.publish({
        type: publishType,
        title: publishTitle.trim(),
        message: publishMessage.trim(),
        recipient_user_ids: selectedRecipientIds.length > 0 ? selectedRecipientIds : undefined,
      });
      setPublishTitle('');
      setPublishMessage('');
      setSelectedRecipientIds([]);
      setFeedback({ tone: 'success', message: 'Notification published successfully.' });
      await load();
    } catch (error: any) {
      setFeedback({ tone: 'error', message: error?.response?.data?.message || 'Failed to publish notification.' });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Communication"
        title="Notifications Center"
        description="Track announcements, salary alerts, and internal updates with proper read state and search."
        actions={
          <div className="flex gap-2">
            <Button onClick={markAllRead} variant="secondary">Mark all read</Button>
            <Button onClick={load} variant="secondary">Refresh</Button>
          </div>
        }
      />

      {feedback ? <FeedbackBanner tone={feedback.tone} message={feedback.message} /> : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SurfaceCard className="p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-sky-100 p-3 text-sky-700"><BellRing className="h-5 w-5" /></div>
            <div>
              <p className="text-sm text-slate-500">Visible notifications</p>
              <p className="text-2xl font-semibold text-slate-950">{notifications.length}</p>
            </div>
          </div>
        </SurfaceCard>
        <SurfaceCard className="p-5">
          <p className="text-sm text-slate-500">Unread</p>
          <p className="text-2xl font-semibold text-slate-950">{unreadCount}</p>
        </SurfaceCard>
        <SurfaceCard className="p-5">
          <p className="text-sm text-slate-500">Filters</p>
          <p className="text-sm font-medium text-slate-950">
            {statusFilter === 'all' ? 'All statuses' : statusFilter === 'unread' ? 'Unread only' : 'Read only'}
            {typeFilter ? ` - ${typeFilter}` : ''}
          </p>
        </SurfaceCard>
      </div>

      <SurfaceCard className="p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <FieldLabel>Search</FieldLabel>
            <TextInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title or message" />
          </div>
          <div>
            <FieldLabel>Type</FieldLabel>
            <SelectInput value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              <option value="">All types</option>
              <option value="announcement">Announcement</option>
              <option value="news">News</option>
              <option value="salary_credited">Salary credited</option>
            </SelectInput>
          </div>
          <div>
            <FieldLabel>Status</FieldLabel>
            <SelectInput value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | 'unread' | 'read')}>
              <option value="all">All</option>
              <option value="unread">Unread</option>
              <option value="read">Read</option>
            </SelectInput>
          </div>
        </div>
      </SurfaceCard>

      {isAdmin ? (
        <SurfaceCard className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Publish update</h2>
              <p className="text-sm text-slate-500">Send organization-wide news or a targeted announcement.</p>
            </div>
            <Button onClick={publish}>
              <Send className="h-4 w-4" />
              Publish
            </Button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <FieldLabel>Type</FieldLabel>
              <SelectInput value={publishType} onChange={(event) => setPublishType(event.target.value as 'announcement' | 'news')}>
                <option value="announcement">Announcement</option>
                <option value="news">News</option>
              </SelectInput>
            </div>
            <div>
              <FieldLabel>Title</FieldLabel>
              <TextInput value={publishTitle} onChange={(event) => setPublishTitle(event.target.value)} placeholder="Title" />
            </div>
          </div>

          <div className="mt-4">
            <FieldLabel>Message</FieldLabel>
            <TextareaInput value={publishMessage} onChange={(event) => setPublishMessage(event.target.value)} rows={4} placeholder="Write the update you want employees to receive." />
          </div>

          <div className="mt-4">
            <FieldLabel>Recipients</FieldLabel>
            <div className="max-h-44 overflow-auto rounded-[22px] border border-slate-200 p-3">
              {users.length === 0 ? (
                <p className="text-sm text-slate-500">All users in your organization will receive this update.</p>
              ) : (
                users.map((recipient) => (
                  <label key={recipient.id} className="flex items-center gap-2 py-1 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={selectedRecipientIds.includes(recipient.id)}
                      onChange={(event) => {
                        setSelectedRecipientIds((prev) =>
                          event.target.checked ? [...prev, recipient.id] : prev.filter((id) => id !== recipient.id)
                        );
                      }}
                    />
                    {recipient.name} ({recipient.email})
                  </label>
                ))
              )}
            </div>
            <p className="mt-2 text-xs text-slate-500">Leave recipients empty to publish to the full organization.</p>
          </div>
        </SurfaceCard>
      ) : null}

      {isLoading ? (
        <PageLoadingState label="Loading notifications..." />
      ) : notifications.length === 0 ? (
        <PageEmptyState title="No notifications found" description="Try a different filter or wait for the next update." />
      ) : (
        <div className="space-y-3">
          {notifications.map((item) => (
            <SurfaceCard key={item.id} className={`p-5 ${item.is_read ? '' : 'border-sky-200 bg-sky-50/40'}`}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {item.type.replace('_', ' ')}
                    </span>
                    {!item.is_read ? (
                      <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-700">Unread</span>
                    ) : null}
                    <span className="text-xs text-slate-500">{new Date(item.created_at).toLocaleString()}</span>
                  </div>
                  <h2 className="text-lg font-semibold text-slate-950">{item.title}</h2>
                  <p className="text-sm text-slate-600">{item.message}</p>
                  {item.sender ? (
                    <p className="text-xs text-slate-500">Sent by {item.sender.name}</p>
                  ) : null}
                </div>

                {!item.is_read ? (
                  <Button size="sm" variant="secondary" onClick={() => markRead(item.id)}>
                    Mark read
                  </Button>
                ) : null}
              </div>
            </SurfaceCard>
          ))}
        </div>
      )}
    </div>
  );
}
