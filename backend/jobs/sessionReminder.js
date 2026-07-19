// backend/jobs/sessionReminder.js
// Automated Session Reminder System
// Checks every 5 minutes for sessions starting soon, firing two independent
// tiers (15 min out, 5 min out) — see models/ScheduledSession.js's
// reminder15Sent/reminder5Sent (replaces the old single reminderSent boolean).

const ScheduledSession = require('../models/ScheduledSession');
const Notification = require('../models/Notification');
const User = require('../models/User');

// Resolves the full "who should be reminded" list for a session: everyone who
// pre-registered, UNION everyone the teacher invited by email (Private Session
// invite list) who already has a ClassVibe account — the same email→User
// resolution routes/schedule.js's POST /create notification already does.
// Deduped by user id so a registered+invited student isn't notified twice.
async function resolveRecipientIds(session) {
  const registeredIds = session.registeredStudents.map(s => s.user.toString());

  let invitedIds = [];
  if (session.allowedEmails && session.allowedEmails.length > 0) {
    const invitedUsers = await User.find({ email: { $in: session.allowedEmails }, role: 'student' }).select('_id');
    invitedIds = invitedUsers.map(u => u._id.toString());
  }

  return [...new Set([...registeredIds, ...invitedIds])];
}

/**
 * Check for upcoming sessions and send reminders — two independent tiers,
 * both checked every poll so a session already inside both windows (e.g. one
 * created 12 minutes before its own start) can legitimately fire both at once.
 */
async function checkSessionReminders() {
  try {
    console.log('🔔 Checking for upcoming session reminders...');

    const now = new Date();

    // Fetch all scheduled, reminders-enabled sessions still missing at least one
    // tier. We filter by combined date+time in JS because scheduledDate is stored
    // as midnight-only and scheduledTime is a separate "HH:MM" string.
    const candidates = await ScheduledSession.find({
      status: 'scheduled',
      enableReminders: true,
      $or: [{ reminder15Sent: { $ne: true } }, { reminder5Sent: { $ne: true } }]
    }).populate('teacher', 'name username');

    let remindersSent = 0;

    for (const session of candidates) {
      try {
        if (!session.scheduledDate || !session.scheduledTime) continue;

        const dateStr = new Date(session.scheduledDate).toISOString().split('T')[0];
        const sessionDT = new Date(`${dateStr}T${session.scheduledTime}`);
        const minutesUntilStart = (sessionDT - now) / (60 * 1000);

        if (minutesUntilStart < 0) continue; // already started/passed, nothing to remind

        const dueTiers = [];
        if (!session.reminder15Sent && minutesUntilStart <= 15) dueTiers.push(15);
        if (!session.reminder5Sent && minutesUntilStart <= 5) dueTiers.push(5);
        if (dueTiers.length === 0) continue;

        const recipientIds = await resolveRecipientIds(session);

        const enrichedSession = {
          ...session.toObject(),
          teacherName: session.teacher?.name || session.teacher?.username || 'Teacher'
        };

        for (const tier of dueTiers) {
          if (recipientIds.length > 0) {
            await Notification.notifySessionStartingSoon(enrichedSession, recipientIds, tier);
            console.log(`📨 ${tier}-min reminder sent to ${recipientIds.length} student(s) for: ${session.sessionName}`);
          } else {
            console.log(`⚠️ No recipients for ${tier}-min reminder: ${session.sessionName}`);
          }
          if (tier === 15) session.reminder15Sent = true;
          if (tier === 5) session.reminder5Sent = true;
          remindersSent++;
        }

        await session.save();

      } catch (sessionError) {
        console.error(`❌ Reminder error for session ${session._id}:`, sessionError.message);
      }
    }

    console.log(remindersSent > 0 ? `✅ Sent ${remindersSent} reminder(s)` : '✅ No reminders due right now');

  } catch (error) {
    console.error('❌ Session reminder job error:', error.message);
  }
}

/**
 * Start the session reminder job
 * Runs every 5 minutes
 */
function startSessionReminderJob() {
  console.log('🚀 Session reminder job started (runs every 5 minutes)');

  // Run immediately on startup
  checkSessionReminders();

  // Then run every 5 minutes
  const intervalId = setInterval(checkSessionReminders, 5 * 60 * 1000);

  return intervalId;
}

/**
 * Stop the session reminder job
 * @param {NodeJS.Timeout} intervalId - The interval ID from startSessionReminderJob
 */
function stopSessionReminderJob(intervalId) {
  if (intervalId) {
    clearInterval(intervalId);
    console.log('🛑 Session reminder job stopped');
  }
}

module.exports = {
  checkSessionReminders,
  startSessionReminderJob,
  stopSessionReminderJob
};
