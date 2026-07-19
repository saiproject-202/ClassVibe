// backend/routes/analytics.js
// Student analytics and reporting API

const express = require('express');
const router = express.Router();
const Analytics = require('../models/Analytics');
const Group = require('../models/Group');
const User = require('../models/User');
const QuizResult = require('../models/QuizResult');
const Message = require('../models/Message');
const { authenticateToken, isTeacher } = require('../middleware/auth');

// ========================================
// MIDDLEWARE — Final audit: was a locally-duplicated JWT verifier AND a
// locally-duplicated isTeacher (which did its own extra User.findById lookup
// since its local authenticateToken never set req.user) — now both canonical,
// imported above. Every handler in this file only ever reads req.userId, which
// the canonical middleware still sets identically (plus req.user, unused here
// but harmless).
// ========================================

// Get group analytics summary (teacher only)
router.get('/group/:groupId/summary', authenticateToken, isTeacher, async (req, res) => {
  try {
    const { groupId } = req.params;
    
    // Check if user is admin of group
    const group = await Group.findById(groupId);
    if (!group || !group.isAdmin(req.userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const summary = await Analytics.getGroupSummary(groupId);
    
    res.json({ summary });
    
  } catch (error) {
    console.error('Get summary error:', error);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// Get all students analytics for a group (teacher only)
router.get('/group/:groupId/students', authenticateToken, isTeacher, async (req, res) => {
  try {
    const { groupId } = req.params;
    
    const group = await Group.findById(groupId);
    if (!group || !group.isAdmin(req.userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const analytics = await Analytics.find({ group: groupId })
      .populate('student', 'name username email')
      .sort({ 'engagement.participationRate': -1 });
    
    // Update performance levels
    for (let analytic of analytics) {
      await analytic.calculateParticipation();
      analytic.evaluatePerformance();
      await analytic.save();
    }
    
    res.json({ analytics });
    
  } catch (error) {
    console.error('Get students analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Get individual student analytics (teacher only)
router.get('/student/:studentId/group/:groupId', authenticateToken, isTeacher, async (req, res) => {
  try {
    const { studentId, groupId } = req.params;
    
    const group = await Group.findById(groupId);
    if (!group || !group.isAdmin(req.userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    let analytics = await Analytics.getOrCreate(studentId, groupId);
    await analytics.populate('student', 'name username email');
    
    // Get recent quiz results
    const recentQuizzes = await QuizResult.find({
      student: studentId,
      group: groupId
    })
    .populate('quiz', 'title')
    .sort({ createdAt: -1 })
    .limit(10);
    
    // Get recent messages
    const recentMessages = await Message.find({
      sender: studentId,
      group: groupId
    })
    .sort({ createdAt: -1 })
    .limit(20);
    
    res.json({
      analytics,
      recentQuizzes,
      recentMessages: recentMessages.length
    });
    
  } catch (error) {
    console.error('Get student analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Get top performers in group
router.get('/group/:groupId/top-performers', authenticateToken, isTeacher, async (req, res) => {
  try {
    const { groupId } = req.params;
    const limit = parseInt(req.query.limit) || 5;
    
    const group = await Group.findById(groupId);
    if (!group || !group.isAdmin(req.userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const topPerformers = await Analytics.getTopPerformers(groupId, limit);
    
    res.json({ topPerformers });
    
  } catch (error) {
    console.error('Get top performers error:', error);
    res.status(500).json({ error: 'Failed to fetch top performers' });
  }
});

// Get students needing attention
router.get('/group/:groupId/needs-attention', authenticateToken, isTeacher, async (req, res) => {
  try {
    const { groupId } = req.params;
    
    const group = await Group.findById(groupId);
    if (!group || !group.isAdmin(req.userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const students = await Analytics.getNeedsAttention(groupId);
    
    res.json({ students });
    
  } catch (error) {
    console.error('Get needs attention error:', error);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

// Get attendance report
router.get('/group/:groupId/attendance', authenticateToken, isTeacher, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { startDate, endDate } = req.query;
    
    const group = await Group.findById(groupId);
    if (!group || !group.isAdmin(req.userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const analytics = await Analytics.find({ group: groupId })
      .populate('student', 'name username email');
    
    const attendanceData = analytics.map(a => {
      let sessions = a.sessionAttendance;
      
      // Filter by date range if provided
      if (startDate || endDate) {
        sessions = sessions.filter(s => {
          const sessionDate = new Date(s.sessionDate);
          if (startDate && sessionDate < new Date(startDate)) return false;
          if (endDate && sessionDate > new Date(endDate)) return false;
          return true;
        });
      }
      
      return {
        student: a.student,
        totalSessions: sessions.length,
        attended: sessions.filter(s => s.wasPresent).length,
        totalDuration: sessions.reduce((sum, s) => sum + (s.duration || 0), 0),
        averageDuration: sessions.length > 0 
          ? sessions.reduce((sum, s) => sum + (s.duration || 0), 0) / sessions.length
          : 0,
        attendanceRate: sessions.length > 0
          ? Math.round((sessions.filter(s => s.wasPresent).length / sessions.length) * 100)
          : 0
      };
    });
    
    res.json({ attendanceData });
    
  } catch (error) {
    console.error('Get attendance error:', error);
    res.status(500).json({ error: 'Failed to fetch attendance' });
  }
});

// Get quiz performance report
router.get('/group/:groupId/quiz-performance', authenticateToken, isTeacher, async (req, res) => {
  try {
    const { groupId } = req.params;
    
    const group = await Group.findById(groupId);
    if (!group || !group.isAdmin(req.userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const analytics = await Analytics.find({ group: groupId })
      .populate('student', 'name username email')
      .sort({ 'quizStats.averageScore': -1 });
    
    const quizData = analytics.map(a => ({
      student: a.student,
      totalQuizzes: a.quizStats.totalQuizzesTaken,
      averageScore: Math.round(a.quizStats.averageScore),
      highestScore: a.quizStats.highestScore,
      lowestScore: a.quizStats.lowestScore,
      totalPoints: a.quizStats.totalPoints,
      accuracy: a.quizStats.totalQuestions > 0
        ? Math.round((a.quizStats.correctAnswers / a.quizStats.totalQuestions) * 100)
        : 0,
      badges: a.quizStats.badges,
      averageTime: Math.round(a.quizStats.averageTimePerQuestion)
    }));
    
    res.json({ quizData });
    
  } catch (error) {
    console.error('Get quiz performance error:', error);
    res.status(500).json({ error: 'Failed to fetch quiz performance' });
  }
});

// Get engagement report
router.get('/group/:groupId/engagement', authenticateToken, isTeacher, async (req, res) => {
  try {
    const { groupId } = req.params;
    
    const group = await Group.findById(groupId);
    if (!group || !group.isAdmin(req.userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const analytics = await Analytics.find({ group: groupId })
      .populate('student', 'name username email')
      .sort({ 'messageStats.totalMessages': -1 });
    
    const engagementData = analytics.map(a => ({
      student: a.student,
      totalMessages: a.messageStats.totalMessages,
      textMessages: a.messageStats.textMessages,
      fileUploads: a.messageStats.fileUploads,
      pollsParticipated: a.messageStats.pollsParticipated,
      participationRate: a.engagement.participationRate,
      lastActive: a.engagement.lastActive,
      weeklyMessages: a.weeklyTrends.messagesThisWeek,
      weeklyQuizzes: a.weeklyTrends.quizzesThisWeek
    }));
    
    res.json({ engagementData });
    
  } catch (error) {
    console.error('Get engagement error:', error);
    res.status(500).json({ error: 'Failed to fetch engagement' });
  }
});

// ========================================
// STUDENT-FACING ROUTES
// ========================================

// Get my analytics (student view)
router.get('/my-analytics/:groupId', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    
    // Check if student is member of group
    const group = await Group.findById(groupId);
    if (!group || !group.isMember(req.userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    let analytics = await Analytics.getOrCreate(req.userId, groupId);
    await analytics.calculateParticipation();
    analytics.evaluatePerformance();
    await analytics.save();
    
    // Get recent quiz results
    const recentQuizzes = await QuizResult.find({
      student: req.userId,
      group: groupId
    })
    .populate('quiz', 'title')
    .sort({ createdAt: -1 })
    .limit(5);
    
    // Get rank in group
    const allAnalytics = await Analytics.find({ group: groupId })
      .sort({ 'quizStats.averageScore': -1 });
    
    const myRank = allAnalytics.findIndex(a => 
      a.student.toString() === req.userId.toString()
    ) + 1;
    
    res.json({
      analytics,
      recentQuizzes,
      rank: myRank,
      totalStudents: allAnalytics.length
    });
    
  } catch (error) {
    console.error('Get my analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// ========================================
// UTILITY ROUTES
// ========================================

// Refresh analytics for all students in group (teacher only)
router.post('/group/:groupId/refresh', authenticateToken, isTeacher, async (req, res) => {
  try {
    const { groupId } = req.params;
    
    const group = await Group.findById(groupId);
    if (!group || !group.isAdmin(req.userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Get all members
    const memberIds = group.members.map(m => m.user);
    
    // Update analytics for each member
    for (let memberId of memberIds) {
      let analytics = await Analytics.getOrCreate(memberId, groupId);
      
      // Recalculate everything
      await analytics.calculateParticipation();
      analytics.evaluatePerformance();
      await analytics.save();
    }
    
    res.json({ message: 'Analytics refreshed successfully' });
    
  } catch (error) {
    console.error('Refresh analytics error:', error);
    res.status(500).json({ error: 'Failed to refresh analytics' });
  }
});

// Export analytics as CSV (teacher only)
router.get('/group/:groupId/export', authenticateToken, isTeacher, async (req, res) => {
  try {
    const { groupId } = req.params;
    const { type } = req.query; // 'attendance', 'quiz', 'engagement', 'all'
    
    const group = await Group.findById(groupId);
    if (!group || !group.isAdmin(req.userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const analytics = await Analytics.find({ group: groupId })
      .populate('student', 'name username email');
    
    // Generate CSV data
    let csvData = [];
    
    if (type === 'attendance' || type === 'all') {
      csvData.push('Name,Email,Total Sessions,Attended,Attendance Rate,Total Time (min)');
      analytics.forEach(a => {
        const attended = a.sessionAttendance.filter(s => s.wasPresent).length;
        const total = a.sessionAttendance.length;
        const rate = total > 0 ? Math.round((attended / total) * 100) : 0;
        const duration = a.sessionAttendance.reduce((sum, s) => sum + (s.duration || 0), 0);
        
        csvData.push(
          `${a.student.name},${a.student.email},${total},${attended},${rate}%,${Math.round(duration)}`
        );
      });
    }
    
    if (type === 'quiz' || type === 'all') {
      if (type === 'all') csvData.push(''); // Empty line
      csvData.push('Name,Email,Quizzes Taken,Avg Score,Highest,Lowest,Accuracy,Gold,Silver,Bronze');
      analytics.forEach(a => {
        const accuracy = a.quizStats.totalQuestions > 0
          ? Math.round((a.quizStats.correctAnswers / a.quizStats.totalQuestions) * 100)
          : 0;
        
        csvData.push(
          `${a.student.name},${a.student.email},${a.quizStats.totalQuizzesTaken},` +
          `${Math.round(a.quizStats.averageScore)},${a.quizStats.highestScore},` +
          `${a.quizStats.lowestScore},${accuracy}%,${a.quizStats.badges.gold},` +
          `${a.quizStats.badges.silver},${a.quizStats.badges.bronze}`
        );
      });
    }
    
    const csvContent = csvData.join('\n');
    
    res.header('Content-Type', 'text/csv');
    res.header('Content-Disposition', `attachment; filename="analytics-${groupId}-${Date.now()}.csv"`);
    res.send(csvContent);
    
  } catch (error) {
    console.error('Export analytics error:', error);
    res.status(500).json({ error: 'Failed to export analytics' });
  }
});

module.exports = router;