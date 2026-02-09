// backend/routes/groupRoutes.js
const express = require('express');
const router = express.Router();

// Import controller functions
const groupController = require('../controllers/groupController');

// Import authentication middleware
const { authenticateToken, isTeacher } = require('../middleware/auth');

// ============================================
// GROUP/SESSION ROUTES
// ============================================

/**
 * @route   POST /api/groups/create
 * @desc    Create a new group/session (Teacher only)
 * @access  Private (Teacher)
 * @body    { groupName: string }
 * @returns { success: true, group: {...} }
 */
router.post('/create', authenticateToken, isTeacher, groupController.createGroup);

/**
 * @route   POST /api/groups/join
 * @desc    Join a group using PIN (supports guest join with name/email)
 * @access  Public (no auth required for guest students)
 * @body    { pin: string, name?: string, email?: string }
 * @returns { success: true, token?: string, user?: {...}, group: {...} }
 * 
 * Note: If authenticated user joins, no name/email needed
 *       If guest joins, provide pin + name + email to create student account
 */
router.post('/join', groupController.joinGroup);

/**
 * @route   GET /api/groups/my-groups
 * @desc    Get all groups for authenticated user
 * @access  Private
 * @returns { success: true, groups: [...] }
 */
router.get('/my-groups', authenticateToken, groupController.getMyGroups);

/**
 * @route   GET /api/groups/:groupId
 * @desc    Get details of a specific group
 * @access  Private
 * @returns { success: true, group: {...} }
 */
router.get('/:groupId', authenticateToken, groupController.getGroupDetails);

/**
 * @route   POST /api/groups/:groupId/end
 * @desc    End a session (Teacher only - must be admin of the group)
 * @access  Private (Teacher, Admin of group)
 * @returns { success: true, message: string }
 */
router.post('/:groupId/end', authenticateToken, groupController.endSession);

// Export router
module.exports = router;