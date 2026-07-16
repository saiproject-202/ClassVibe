// backend/routes/profile.js
// Teacher Profile and Student ("My Profile") screens — see AVATAR_FOUNDATION.md
// for the avatar data these read. Stats are computed live from real QuizResult/
// Analytics data; nothing here is hardcoded sample content.

const express = require('express');
const router = express.Router();
const { authenticateToken, isTeacher } = require('../middleware/auth');
const User = require('../models/User');
const Group = require('../models/Group');
const Quiz = require('../models/Quiz');
const QuizResult = require('../models/QuizResult');
const Analytics = require('../models/Analytics');

const isStudent = (req, res, next) => {
  if (!req.user || req.user.role !== 'student') {
    return res.status(403).json({ error: 'Access denied. Student role required.' });
  }
  next();
};

// ------------------
// GET /api/profile/teacher
// ------------------
router.get('/teacher', authenticateToken, isTeacher, async (req, res) => {
  try {
    const teacherId = req.user._id;

    const groups = await Group.find({ admin: teacherId, isQuickQuiz: { $ne: true } })
      .select('groupName members');
    const groupIds = groups.map(g => g._id);

    const studentIdSet = new Set();
    groups.forEach(g => {
      g.members.forEach(m => {
        const uid = m.user.toString();
        if (uid !== teacherId.toString()) studentIdSet.add(uid);
      });
    });

    const quizzesRunCount = await Quiz.countDocuments({ creator: teacherId });

    const avgAgg = await QuizResult.aggregate([
      { $match: { group: { $in: groupIds } } },
      { $group: { _id: '$group', avgPercentage: { $avg: '$percentage' } } }
    ]);
    const avgByGroup = {};
    avgAgg.forEach(a => { avgByGroup[a._id.toString()] = Math.round(a.avgPercentage); });

    const classes = groups.map(g => ({
      groupId: g._id.toString(),
      groupName: g.groupName,
      studentCount: g.members.filter(m => m.user.toString() !== teacherId.toString()).length,
      avgPercentage: avgByGroup[g._id.toString()] ?? null
    }));

    res.json({
      name: req.user.name,
      teacherProfile: req.user.teacherProfile,
      classesCount: groups.length,
      studentsCount: studentIdSet.size,
      quizzesRunCount,
      classes
    });
  } catch (err) {
    console.error('Get teacher profile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ------------------
// PUT /api/profile/teacher
// ------------------
router.put('/teacher', authenticateToken, isTeacher, async (req, res) => {
  try {
    const editableFields = ['subject', 'gradeRange', 'school', 'degree', 'yearsExperience', 'certifications'];
    const $set = {};
    for (const field of editableFields) {
      if (req.body[field] !== undefined) {
        $set[`teacherProfile.${field}`] = req.body[field];
      }
    }
    // findByIdAndUpdate only validates the fields being set, unlike a full
    // document .save() — req.user here is loaded with `-password` by the auth
    // middleware, and re-saving the whole document would wrongly re-trigger the
    // "teachers must have a password" check against that projected-out field.
    const updated = await User.findByIdAndUpdate(
      req.user._id,
      { $set },
      { new: true, runValidators: true }
    ).select('teacherProfile');
    res.json({ message: 'Teacher profile updated', teacherProfile: updated.teacherProfile });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    console.error('Update teacher profile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ------------------
// GET /api/profile/student
// ------------------
router.get('/student', authenticateToken, isStudent, async (req, res) => {
  try {
    const studentId = req.user._id;

    // Day streak — consecutive calendar days with at least one completed quiz,
    // ending today or yesterday (so it doesn't reset to 0 before a student's
    // first quiz of the day).
    const results = await QuizResult.find({ student: studentId })
      .select('completedAt')
      .sort({ completedAt: -1 });
    const dayStrings = [...new Set(results.map(r => r.completedAt.toISOString().slice(0, 10)))];

    let streak = 0;
    if (dayStrings.length > 0) {
      const oneDayMs = 24 * 60 * 60 * 1000;
      const todayStr = new Date().toISOString().slice(0, 10);
      let cursor = new Date(todayStr);
      if (dayStrings[0] !== todayStr) {
        const yesterdayStr = new Date(cursor.getTime() - oneDayMs).toISOString().slice(0, 10);
        cursor = dayStrings[0] === yesterdayStr ? new Date(yesterdayStr) : null;
      }
      if (cursor) {
        for (const d of dayStrings) {
          const expected = cursor.toISOString().slice(0, 10);
          if (d !== expected) break;
          streak += 1;
          cursor = new Date(cursor.getTime() - oneDayMs);
        }
      }
    }

    // Wins — total gold badges (rank 1 finishes) across every group's Analytics record
    const analyticsDocs = await Analytics.find({ student: studentId }).select('quizStats.badges');
    const wins = analyticsDocs.reduce((sum, a) => sum + (a.quizStats?.badges?.gold || 0), 0);

    // "Top X% this week" — percentile among peers in the same group(s), based on
    // this week's average percentage. Null (not fabricated) if there isn't enough
    // peer data yet to make the comparison meaningful.
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const myGroups = await Group.find({ 'members.user': studentId }).select('_id');
    const myGroupIds = myGroups.map(g => g._id);

    const weeklyAgg = await QuizResult.aggregate([
      { $match: { group: { $in: myGroupIds }, completedAt: { $gte: sevenDaysAgo } } },
      { $group: { _id: '$student', avgPercentage: { $avg: '$percentage' } } },
      { $sort: { avgPercentage: -1 } }
    ]);

    let topPercentile = null;
    if (weeklyAgg.length >= 2) {
      const myIndex = weeklyAgg.findIndex(a => a._id.toString() === studentId.toString());
      if (myIndex !== -1) {
        topPercentile = Math.max(1, Math.ceil(((myIndex + 1) / weeklyAgg.length) * 100));
      }
    }

    res.json({
      name: req.user.name,
      avatar: req.user.avatar,
      stats: { streak, wins, topPercentile }
    });
  } catch (err) {
    console.error('Get student profile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
