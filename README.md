# Notifications in-site

Patch for the Calendar project.

Files:
- Calendar/js/auth.js — integrates the notification bell into the existing auth menu.
- Calendar/js/notifications.js — notification loading, unread count, mark-read RPCs and Supabase Realtime.
- Calendar/css/style.css — notification UI styles.

Database already updated:
- notification_events.read_at
- RLS: users can only SELECT their own notifications
- mark_notification_read(uuid)
- mark_all_notifications_read()
- notification indexes
- notification_events added to supabase_realtime
- replica identity FULL for realtime UPDATE/DELETE support

The patch is designed to be merged into the current site without replacing the existing calendar.js.
