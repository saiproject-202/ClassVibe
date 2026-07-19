// backend/routes/schedule.js
// ✅ NEW additions (existing routes unchanged):
//   POST  /draft               — save a draft
//   GET   /drafts              — get teacher's drafts
//   DELETE /draft/:draftId     — delete a draft
//   POST  /:sessionId/verify-access  — student email+password check
//                                      (emits socket notification to teacher if unregistered)
//   GET   /:sessionId/unauthorized-attempts — teacher sees who tried to join

const express = require('express');
const router = express.Router();
const ScheduledSession = require('../models/ScheduledSession');
const Group = require('../models/Group');
const User = require('../models/User');
const Notification = require('../models/Notification');
const crypto = require('crypto');
const { authenticateToken } = require('../middleware/auth');

// ════════════════════════════════════════════
// MIDDLEWARE — Final audit: was a locally-duplicated JWT verifier, now the
// canonical authenticateToken imported above. Every handler in this file only
// ever reads req.userId, which the canonical middleware still sets identically.
// ════════════════════════════════════════════
// ✅ NEW: DRAFT ROUTES
// ════════════════════════════════════════════

// POST /api/schedule/draft — Save a draft
router.post('/draft', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    if (user.role !== 'teacher') {
      return res.status(403).json({ error: 'Only teachers can save drafts' });
    }

    const {
      sessionName, subject, description,
      scheduledDate, scheduledTime, endTime, duration,
      accessType, customPin, enableReminders,
      allowedStudents, allowedEmails, maxStudents
    } = req.body;

    if (!sessionName?.trim()) {
      return res.status(400).json({ error: 'Session title is required to save a draft' });
    }

    const joinCode = crypto.randomBytes(4).toString('hex').toUpperCase();

    // Build email list from allowedStudents if provided
    const students = allowedStudents || [];
    const emails = students.map(s => s.email?.toLowerCase().trim()).filter(Boolean);

    const draft = new ScheduledSession({
      sessionName,
      subject:          subject || sessionName,
      description:      description || '',
      teacher:          req.userId,
      scheduledDate:    scheduledDate || null,
      scheduledTime:    scheduledTime || null,
      endTime:          endTime || null,
      duration:         duration || '1 Hour',
      accessType:       accessType || 'private',
      customPin:        customPin || null,
      enableReminders:  enableReminders !== false,
      allowedStudents:  students,
      allowedEmails:    emails.length ? emails : (allowedEmails || []),
      maxStudents:      maxStudents || 100,
      joinCode,
      status: 'draft'
    });

    await draft.save();
    console.log('✅ Draft saved:', draft.sessionName);
    res.status(201).json({ message: 'Draft saved successfully', draft });

  } catch (error) {
    console.error('Save draft error:', error);
    res.status(500).json({ error: 'Failed to save draft' });
  }
});

// GET /api/schedule/drafts — Get all drafts for this teacher
router.get('/drafts', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    if (user.role !== 'teacher') {
      return res.status(403).json({ error: 'Only teachers can view drafts' });
    }

    const drafts = await ScheduledSession.getTeacherDrafts(req.userId);
    res.json({ drafts });

  } catch (error) {
    console.error('Get drafts error:', error);
    res.status(500).json({ error: 'Failed to fetch drafts' });
  }
});

// DELETE /api/schedule/draft/:draftId — Delete a draft
router.delete('/draft/:draftId', authenticateToken, async (req, res) => {
  try {
    const draft = await ScheduledSession.findById(req.params.draftId);
    if (!draft) return res.status(404).json({ error: 'Draft not found' });
    if (draft.teacher.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (draft.status !== 'draft') {
      return res.status(400).json({ error: 'This is not a draft' });
    }
    await draft.deleteOne();
    res.json({ message: 'Draft deleted successfully' });

  } catch (error) {
    console.error('Delete draft error:', error);
    res.status(500).json({ error: 'Failed to delete draft' });
  }
});

// ════════════════════════════════════════════
// TEACHER ROUTES — UNCHANGED (with minor enhancements)
// ════════════════════════════════════════════

// POST /api/schedule/create — Create a scheduled session
router.post('/create', authenticateToken, async (req, res) => {
  try {
    const {
      sessionName, subject, description,
      scheduledDate, scheduledTime, endTime, duration,
      accessType, customPin, enableReminders,
      allowedStudents, allowedEmails,
      maxStudents, requireApproval
    } = req.body;

    if (!sessionName || !scheduledDate || !scheduledTime) {
      return res.status(400).json({
        error: 'Session name, date, and start time are required'
      });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    if (user.role !== 'teacher') {
      return res.status(403).json({ error: 'Only teachers can create sessions' });
    }

    // Validate date is in future
    const dt = new Date(`${scheduledDate}T${scheduledTime}`);
    if (dt <= new Date()) {
      return res.status(400).json({ error: 'Cannot schedule session in the past' });
    }

    const joinCode = crypto.randomBytes(4).toString('hex').toUpperCase();

    // Build email list from allowedStudents
    const students = allowedStudents || [];
    const emails = students.map(s => s.email?.toLowerCase().trim()).filter(Boolean);

    const session = new ScheduledSession({
      sessionName,
      subject:          subject || sessionName,
      description,
      teacher:          req.userId,
      scheduledDate,
      scheduledTime,
      endTime:          endTime || null,
      duration:         duration || '1 Hour',
      accessType:       accessType || 'private',
      customPin:        customPin || null,
      enableReminders:  enableReminders !== false,
      allowedStudents:  students,
      allowedEmails:    emails.length ? emails : (allowedEmails || []),
      maxStudents:      maxStudents || 100,
      requireApproval:  requireApproval || false,
      joinCode,
      status: 'scheduled'
    });

    await session.save();
    await session.populate('teacher', 'name email');

    console.log('✅ Scheduled session created:', session.sessionName);

    // Notify allowed students about the scheduled session
    try {
      const emailList = session.allowedEmails || [];
      if (emailList.length > 0) {
        const students = await User.find({ email: { $in: emailList }, role: 'student' }).select('_id');
        if (students.length > 0) {
          const teacher = await User.findById(req.userId);
          const teacherName = teacher?.name || teacher?.username || 'Your teacher';
          const formattedDate = session.scheduledDate
            ? new Date(session.scheduledDate).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
            : null;
          await Notification.createBulkNotifications(
            students.map(s => s._id),
            {
              sender: req.userId,
              type: 'session_scheduled',
              title: '📚 New Class Invitation',
              message: `You've been invited to "${session.sessionName}". Teacher: ${teacherName}.${formattedDate ? ` Date: ${formattedDate}` : ''}${session.scheduledTime ? ` at ${session.scheduledTime}` : ''}.`,
              relatedSession: session._id,
              priority: 'medium',
              icon: '📚',
              metadata: { sessionId: session._id.toString() }
            }
          );
          console.log(`📢 Notified ${students.length} students about scheduled session`);
        }
      }
    } catch (notifErr) {
      console.error('Schedule notification error (non-fatal):', notifErr.message);
    }

    res.status(201).json({ message: 'Session scheduled successfully', session });

  } catch (error) {
    console.error('Create scheduled session error:', error);
    res.status(500).json({ error: 'Failed to schedule session' });
  }
});

// GET /api/schedule/my-sessions — Get teacher's sessions
router.get('/my-sessions', authenticateToken, async (req, res) => {
  try {
    const { status } = req.query;

    const user = await User.findById(req.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    if (user.role !== 'teacher') {
      return res.status(403).json({ error: 'Only teachers can view their sessions' });
    }

    let query = { teacher: req.userId };
    if (status && status !== 'all') {
      query.status = status;
    } else {
      // By default exclude drafts (they have their own endpoint)
      query.status = { $ne: 'draft' };
    }

    const sessions = await ScheduledSession.find(query)
      .populate('teacher', 'name email')
      .populate('registeredStudents.user', 'name email')
      .sort({ scheduledDate: 1 });

    res.json({ sessions });

  } catch (error) {
    console.error('Get teacher sessions error:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// PUT /api/schedule/:sessionId — Update a scheduled session or draft
router.put('/:sessionId', authenticateToken, async (req, res) => {
  try {
    const session = await ScheduledSession.findById(req.params.sessionId);

    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.teacher.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: 'Only the teacher can update this session' });
    }
    if (!['scheduled', 'draft'].includes(session.status)) {
      return res.status(400).json({ error: 'Cannot update session that is already started or completed' });
    }

    const allowedUpdates = [
      'sessionName', 'subject', 'description',
      'scheduledDate', 'scheduledTime', 'endTime', 'duration',
      'maxStudents', 'requireApproval', 'accessType',
      'customPin', 'enableReminders', 'allowedStudents', 'allowedEmails'
    ];

    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        session[field] = req.body[field];
      }
    });

    // Sync allowedEmails from allowedStudents if provided
    if (req.body.allowedStudents) {
      session.allowedEmails = req.body.allowedStudents
        .map(s => s.email?.toLowerCase().trim())
        .filter(Boolean);
    }

    await session.save();
    await session.populate('teacher', 'name email');

    res.json({ message: 'Session updated successfully', session });

  } catch (error) {
    console.error('Update session error:', error);
    res.status(500).json({ error: 'Failed to update session' });
  }
});

// POST /api/schedule/:sessionId/emails — Manage allowed emails
router.post('/:sessionId/emails', authenticateToken, async (req, res) => {
  try {
    const session = await ScheduledSession.findById(req.params.sessionId);

    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.teacher.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { action, emails } = req.body;
    if (!Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ error: 'Emails array required' });
    }

    if (action === 'add') {
      emails.forEach(email => session.addAllowedEmail(email));
      await session.save();
      res.json({ message: `${emails.length} email(s) added`, allowedEmails: session.allowedEmails });
    } else if (action === 'remove') {
      emails.forEach(email => session.removeAllowedEmail(email));
      await session.save();
      res.json({ message: `${emails.length} email(s) removed`, allowedEmails: session.allowedEmails });
    } else {
      res.status(400).json({ error: 'Invalid action. Use "add" or "remove"' });
    }

  } catch (error) {
    console.error('Manage emails error:', error);
    res.status(500).json({ error: 'Failed to manage emails' });
  }
});

// POST /api/schedule/:sessionId/start — Start session manually (scheduled → live group)
router.post('/:sessionId/start', authenticateToken, async (req, res) => {
  try {
    const session = await ScheduledSession.findById(req.params.sessionId);

    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.teacher.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: 'Only the teacher can start this session' });
    }
    if (session.status !== 'scheduled') {
      return res.status(400).json({ error: 'Session already started or completed' });
    }

    const QRCode = require('qrcode');

    // Use custom PIN if set, otherwise generate one
    let pin = session.customPin;
    if (!pin) {
      let pinExists = true;
      while (pinExists) {
        pin = Math.floor(100000 + Math.random() * 900000).toString();
        pinExists = await Group.findOne({ pin });
      }
    }

    const joinUrl = `${process.env.FRONTEND_URL}?pin=${pin}`;
    const qrCode = await QRCode.toDataURL(joinUrl);

    // Private Session system — seed the live Group's roster from this session's
    // invited emails, resolving each to an existing User account where possible
    // (unresolved emails still get a roster entry so the invite is honored the
    // moment that person creates an account and joins). See POST /api/groups/join
    // in server.js for how isPrivate+roster gate access once live.
    const isPrivate = session.accessType === 'private';
    let roster = [];
    if (isPrivate && session.allowedEmails && session.allowedEmails.length > 0) {
      const invitedUsers = await User.find({ email: { $in: session.allowedEmails } }).select('_id email');
      const userIdByEmail = new Map(invitedUsers.map(u => [u.email, u._id]));
      roster = session.allowedEmails.map(email => ({
        email,
        user: userIdByEmail.get(email) || null,
        status: 'invited',
        invitedAt: new Date()
      }));
    }

    // Create a live Group from this session
    const group = new Group({
      groupName:    session.sessionName,
      admin:        session.teacher,
      members:      [{ user: session.teacher, joinedAt: new Date() }],
      pin,
      qrCode,
      onlineUsers:  [],
      allowedEmails: session.allowedEmails,  // legacy field, kept for backward compat
      isPrivate,
      roster
    });

    await group.save();

    session.status      = 'live';
    session.liveGroupId = group._id;
    await session.save();

    await group.populate('admin', 'username name');

    console.log('✅ Scheduled session started:', session.sessionName);

    // Recipients = everyone who pre-registered UNION everyone invited by email
    // (roster, resolved to an existing account) — not registeredStudents-only,
    // so a Private Session's full invite list hears "class is live", not just
    // the subset who separately opted into pre-registration.
    const registeredIds = session.registeredStudents.map(s => s.user.toString());
    const rosterUserIds = roster.filter(r => r.user).map(r => r.user.toString());
    const recipientIds = [...new Set([...registeredIds, ...rosterUserIds])];

    // Notify — socket + persistent DB notification
    const io = req.app.get('io');
    if (io) {
      recipientIds.forEach(userId => {
        io.to(userId).emit('sessionStarted', {
          sessionName: session.sessionName,
          groupId: group._id,
          pin: group.pin
        });
      });
    }

    try {
      if (recipientIds.length > 0) {
        const teacher = await User.findById(session.teacher);
        await Notification.createBulkNotifications(recipientIds, {
          sender: session.teacher,
          type: 'session_started',
          title: '🚀 Session is Live Now!',
          message: `${teacher?.name || teacher?.username} started "${session.sessionName}". Join now!`,
          relatedGroup: group._id,
          priority: 'high',
          icon: '🚀',
          metadata: { groupId: group._id.toString(), pin: group.pin }
        });
        console.log(`📢 Notified ${recipientIds.length} student(s) that session went live`);
      }
    } catch (notifErr) {
      console.error('Start-session notification error (non-fatal):', notifErr.message);
    }

    res.json({
      message: 'Session started successfully',
      group: {
        id:        group._id,
        groupName: group.groupName,
        pin:       group.pin,
        qrCode:    group.qrCode
      },
      session
    });

  } catch (error) {
    console.error('Start session error:', error);
    res.status(500).json({ error: 'Failed to start session' });
  }
});

// POST /api/schedule/:sessionId/cancel — Cancel a session
router.post('/:sessionId/cancel', authenticateToken, async (req, res) => {
  try {
    const session = await ScheduledSession.findById(req.params.sessionId);

    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.teacher.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    session.status = 'cancelled';
    await session.save();

    const io = req.app.get('io');
    if (io) {
      session.registeredStudents.forEach(student => {
        io.to(student.user.toString()).emit('sessionCancelled', {
          sessionName: session.sessionName,
          message: 'This session has been cancelled by the teacher'
        });
      });
    }

    res.json({ message: 'Session cancelled successfully' });

  } catch (error) {
    console.error('Cancel session error:', error);
    res.status(500).json({ error: 'Failed to cancel session' });
  }
});

// ════════════════════════════════════════════
// ✅ NEW: STUDENT ACCESS VERIFICATION
// ════════════════════════════════════════════

// POST /api/schedule/:sessionId/verify-access
// Student submits their password to join a private session.
// If their email is not registered at all, teacher gets a socket notification.
router.post('/:sessionId/verify-access', authenticateToken, async (req, res) => {
  try {
    const session = await ScheduledSession.findById(req.params.sessionId)
      .populate('teacher', 'name email _id');

    if (!session) return res.status(404).json({ error: 'Session not found' });

    const user = await User.findById(req.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    const { password } = req.body;

    // Public sessions — always allowed
    if (session.accessType === 'public') {
      return res.json({ allowed: true, session });
    }

    // Private: check email + password
    const result = session.verifyStudentPassword(user.email, password);

    if (!result.allowed) {
      if (result.reason === 'email_not_registered') {
        // Log the attempt
        const alreadyLogged = session.unauthorizedAttempts.some(
          a => a.email === user.email
        );

        if (!alreadyLogged) {
          session.unauthorizedAttempts.push({
            email: user.email,
            notifiedTeacher: false
          });
          await session.save();

          // ✅ Emit socket notification to teacher
          const io = req.app.get('io');
          if (io && session.teacher?._id) {
            io.to(session.teacher._id.toString()).emit('unauthorizedJoinAttempt', {
              sessionId:    session._id,
              sessionName:  session.sessionName,
              studentEmail: user.email,
              studentName:  user.name || user.username,
              message: `"${user.email}" tried to join "${session.sessionName}" but is not registered. Add them to grant access.`
            });
            console.log(`📢 Notified teacher about unauthorized join attempt: ${user.email}`);
          }
        }

        return res.status(403).json({
          error: 'Your email is not registered for this session.',
          reason: 'email_not_registered',
          hint: 'Your teacher has been notified. They can add your email to grant you access.'
        });
      }

      if (result.reason === 'wrong_password') {
        return res.status(403).json({
          error: 'Incorrect password for this session.',
          reason: 'wrong_password',
          hint: 'Please check the password given to you by your teacher.'
        });
      }
    }

    res.json({ allowed: true, session });

  } catch (error) {
    console.error('Verify access error:', error);
    res.status(500).json({ error: 'Failed to verify access' });
  }
});

// ✅ NEW: GET /api/schedule/:sessionId/unauthorized-attempts
// Teacher can see who tried to join without being registered
router.get('/:sessionId/unauthorized-attempts', authenticateToken, async (req, res) => {
  try {
    const session = await ScheduledSession.findById(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.teacher.toString() !== req.userId.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }
    res.json({ attempts: session.unauthorizedAttempts });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch unauthorized attempts' });
  }
});

// ════════════════════════════════════════════
// STUDENT ROUTES — UNCHANGED
// ════════════════════════════════════════════

// GET /api/schedule/available — Sessions available to this student
router.get('/available', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const sessions = await ScheduledSession.find({
      status: 'scheduled',
      scheduledDate: { $gte: new Date() },
      $or: [
        { accessType: 'public' },
        { allowedEmails: { $size: 0 } },
        { allowedEmails: user.email.toLowerCase() }
      ]
    })
    .populate('teacher', 'name email')
    .sort({ scheduledDate: 1 });

    const sessionsWithStatus = sessions.map(session => {
      const isRegistered = session.registeredStudents.some(
        s => s.user.toString() === req.userId.toString()
      );
      return {
        ...session.toObject(),
        isRegistered,
        spotsLeft: session.maxStudents - session.registeredStudents.length
      };
    });

    res.json({ sessions: sessionsWithStatus });

  } catch (error) {
    console.error('Get available sessions error:', error);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// POST /api/schedule/:sessionId/register — Register for a session
router.post('/:sessionId/register', authenticateToken, async (req, res) => {
  try {
    const session = await ScheduledSession.findById(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.status !== 'scheduled') {
      return res.status(400).json({ error: 'Cannot register for this session' });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    const result = await session.registerStudent(req.userId, user.email);

    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }

    await session.populate('teacher', 'name email');
    res.json({ message: result.message, session });

  } catch (error) {
    console.error('Register for session error:', error);
    res.status(500).json({ error: 'Failed to register' });
  }
});

// GET /api/schedule/my-registrations — Student's registered sessions
router.get('/my-registrations', authenticateToken, async (req, res) => {
  try {
    const sessions = await ScheduledSession.find({
      'registeredStudents.user': req.userId,
      status: { $in: ['scheduled', 'live'] }
    })
    .populate('teacher', 'name email')
    .populate('liveGroupId', 'pin qrCode')
    .sort({ scheduledDate: 1 });

    res.json({ sessions });

  } catch (error) {
    console.error('Get registered sessions error:', error);
    res.status(500).json({ error: 'Failed to fetch registrations' });
  }
});

module.exports = router; 