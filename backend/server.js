// ============================================
// IMPORTS - Load all required libraries
// ============================================

require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose'); // ✅ ADD THIS

// After: const Message = require('./models/Message');
// ADD THIS:
const ScheduledSession = require('./models/ScheduledSession');  // ⭐ NEW

const connectDB = require('./config/db');
const User = require('./models/User');
const Group = require('./models/Group');
const Message = require('./models/Message');
const Notification = require('./models/Notification');

// ============================================
// SERVER SETUP
// ============================================

const app = express();
const server = http.createServer(app);

// ── CORS origin checker ───────────────────────────────────────────────────
// Allowed:
//   1. Exact match on FRONTEND_URL env var  (production deployment)
//   2. localhost or 127.0.0.1 on any port   (local dev, http or https)
//   3. Any 192.168.x.x on any port          (LAN / mobile dev, http or https)
// Everything else is rejected to keep production security intact.
const isAllowedOrigin = (origin) => {
  if (!origin) return true; // no Origin header = server-to-server or same-origin — allow
  if (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  if (/^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/.test(origin)) return true;
  return false;
};

const corsHandler = (origin, callback) => {
  if (isAllowedOrigin(origin)) {
    callback(null, true);
  } else {
    console.warn(`CORS blocked: ${origin}`);
    callback(new Error(`Origin not allowed by CORS policy: ${origin}`));
  }
};

// Explicit preflight handler — must be before app.use(cors()) and all routes.
// Without this, browsers sending OPTIONS preflight with a custom origin function
// may not receive Access-Control-Allow-Origin before other middleware runs.
app.options('*', cors({ origin: corsHandler, credentials: true }));
app.use(cors({ origin: corsHandler, credentials: true }));

const io = new Server(server, {
  cors: {
    origin: corsHandler,
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ["polling", "websocket"]  // polling first
});

app.set('io', io); 
global.io = io;

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

// Add tracking in socket events (copy from guide)

// ============================================
// ROUTE IMPORTS (Add at top with other imports)
// ============================================
const quizRoutes = require('./routes/quiz');                    // ⭐ ADD THIS
const analyticsRoutes = require('./routes/analytics');          // ⭐ ADD THIS
const notificationRoutes = require('./routes/notifications');   // ⭐ ADD THIS
const { startSessionReminderJob } = require('./jobs/sessionReminder');
// Add this with other route imports (around line 20)
const quizTestRoutes = require('./routes/quiz-test');

// Add this with other app.use routes (around line 50)

// ============================================
// USE ROUTES (Add after other app.use routes)
// ============================================
// ✅ SECOND (VERY IMPORTANT)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/quiz', quizRoutes);                   // ⭐ ADD THIS
app.use('/api/analytics', analyticsRoutes);         // ⭐ ADD THIS
app.use('/api/notifications', notificationRoutes);  // ⭐ ADD THIS

// ============================================
// START JOBS (Add after server starts)
// ============================================

// After io.listen() or server.listen(), add:

// Start session reminder job (optional - controlled by env variable)
if (process.env.ENABLE_SESSION_REMINDERS !== 'false') {
  const reminderJobId = startSessionReminderJob();
  
  // Store job ID for cleanup on shutdown
  process.reminderJobId = reminderJobId;
  
  console.log('✅ Session reminder job is running');
} else {
  console.log('⏸️ Session reminder job is disabled');
}

// In socket connection
const { setupQuizSocketHandlers, cleanupQuizTimers } = require('./socket-handlers/quiz-socket-handlers');

io.on('connection', (socket) => {
  setupQuizSocketHandlers(io, socket); // ← ADD THIS LINE
});  // ... existing auth ...

// Add cleanup
process.on('SIGTERM', () => {
  server.close();
});

// ============================================
// MIDDLEWARE
// ============================================


// ✅ FIX: Add explicit logging
app.use((req, res, next) => {
  if (req.method === 'POST' || req.method === 'PUT') {
    console.log(`📥 ${req.method} ${req.path}`, {
      hasBody: !!req.body,
      contentType: req.headers['content-type']
    });
  }
  next();
});

// ... rest of your code continues here
// ============================================
// FILE UPLOAD SETUP (Multer)
// ============================================

const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '_');
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|mp4|mov|avi|pdf|doc|docx|txt/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  
  if (extname && mimetype) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images, videos, and documents allowed.'));
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: fileFilter
});

// ============================================
// CONNECT TO DATABASE
// ============================================

connectDB();

// ============================================
// HELPER FUNCTIONS
// ============================================

const generatePIN = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
};

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    res.status(403).json({ error: 'Invalid or expired token.' });
  }
};

const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.userId = decoded.userId;
    } catch (error) {
      console.log('Optional auth: Invalid token, proceeding without auth');
    }
  }
  
  next();
};

// ============================================
// REST API ROUTES
// ============================================

app.get('/', (req, res) => {
  res.json({ message: 'Chat App Server is Running! 🚀' });
});

app.get("/", (req, res) => {
  res.send("Server is running ✅");
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date(),
    uptime: process.uptime()
  });
});

// ------------------
// AUTH ROUTES
// ------------------

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password, name, role } = req.body;

    const finalUsername = username || (email ? email.split('@')[0] : null);
    const finalEmail = email || username;

    if (!finalUsername || !password) {
      return res.status(400).json({ error: 'Email/username and password are required' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    const existingUser = await User.findOne({
      $or: [
        { username: finalUsername },
        { email: finalEmail }
      ]
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Username or email already taken' });
    }
    
    const user = new User({
      username: finalUsername,
      email: finalEmail,
      password,
      name: name || finalUsername,
      role: role || 'student'
    });
    
    await user.save();
    
    const token = generateToken(user._id);
    
    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
    
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ 
      message: "Database connection failed",
      error: 'Server error during registration' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    if ((!username && !email) || !password) {
      return res.status(400).json({ error: 'Email/username and password are required' });
    }
    
    const loginIdentifier = email || username;
    
    const user = await User.findOne({
      $or: [
        { username: loginIdentifier },
        { email: loginIdentifier }
      ]
    });
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = generateToken(user._id);
    
    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id.toString(),
        username: user.username,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// ------------------
// STUDENT GUEST AUTH  (used by "Open Student Dashboard" feature only)
// Register if email is new; sign in if email already exists.
// Leaves the existing /register and /login routes completely untouched.
// ------------------
app.post('/api/auth/student-guest-auth', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const emailNorm = email.trim().toLowerCase();

    // ── Case 1: email already exists → sign in ──────────────────────────────
    const existingUser = await User.findOne({ email: emailNorm });
    if (existingUser) {
      const passwordOk = existingUser.password
        ? await existingUser.comparePassword(password)
        : false;
      if (!passwordOk) {
        return res.status(401).json({
          error: 'An account with this email already exists. Enter the password you used when you first joined a classroom.'
        });
      }
      const token = generateToken(existingUser._id);
      return res.json({
        message: 'Signed in successfully',
        token,
        user: {
          id:       existingUser._id.toString(),
          username: existingUser.username,
          email:    existingUser.email,
          name:     existingUser.name,
          role:     existingUser.role
        }
      });
    }

    // ── Case 2: new email → register ─────────────────────────────────────────
    // Generate a unique username: email-prefix + random suffix so it never
    // collides with existing usernames even if two people share a prefix.
    const prefix = emailNorm.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 12);
    const uniqueUsername = (prefix + '_' + Math.random().toString(36).slice(2, 7)).slice(0, 20);

    const user = new User({
      username: uniqueUsername,
      email:    emailNorm,
      password,
      name:     name.trim(),
      role:     'student'
    });
    await user.save();

    const token = generateToken(user._id);
    return res.status(201).json({
      message: 'Account created successfully',
      token,
      user: {
        id:       user._id.toString(),
        username: user.username,
        email:    user.email,
        name:     user.name,
        role:     user.role
      }
    });

  } catch (error) {
    console.error('Student guest auth error:', error);
    return res.status(500).json({ error: 'Server error during authentication.' });
  }
});

// ------------------
// UPDATE PROFILE
// ------------------
app.put('/api/auth/update-profile', authenticateToken, async (req, res) => {
  try {
    const { name, username, profilePhoto } = req.body;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (username && username.trim() !== user.username) {
      const exists = await User.findOne({ username: username.trim(), _id: { $ne: user._id } });
      if (exists) return res.status(400).json({ error: 'Username already taken' });
      user.username = username.trim();
    }
    if (name) user.name = name.trim();
    if (profilePhoto !== undefined) user.profilePhoto = profilePhoto;
    await user.save();
    res.json({
      message: 'Profile updated',
      user: { id: user._id.toString(), username: user.username, email: user.email, name: user.name, role: user.role }
    });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ------------------
// FILE UPLOAD ROUTE
// ------------------

app.post('/api/upload', authenticateToken, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    
    res.json({
      success: true,
      file: {
        url: fileUrl,
        name: req.file.originalname,
        size: req.file.size,
        type: req.file.mimetype
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'File upload failed' });
  }
});

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
    }
    return res.status(400).json({ error: error.message });
  } else if (error) {
    return res.status(400).json({ error: error.message });
  }
  next();
});
  // Find this section:
  // ------------------
  // MESSAGE ROUTES
  // ------------------

  // BEFORE that section, ADD:

  // ------------------
  // SCHEDULE ROUTES
  // ------------------
  const scheduleRoutes = require('./routes/schedule');
  app.use('/api/schedule', scheduleRoutes);

// ------------------
// GROUP ROUTES
// ------------------

app.post('/api/groups/create', authenticateToken, async (req, res) => {
  try {
    const { groupName } = req.body;
    
    if (!groupName) {
      return res.status(400).json({ error: 'Group name is required' });
    }
    
    let pin;
    let pinExists = true;
    while (pinExists) {
      pin = generatePIN();
      pinExists = await Group.findOne({ pin });
    }
    
    const joinUrl = `${process.env.FRONTEND_URL}?pin=${pin}`;
    const qrCode = await QRCode.toDataURL(joinUrl);
    
    const group = new Group({
      groupName,
      admin: req.userId,
      members: [{
        user: req.userId,
        joinedAt: new Date()
      }],
      pin,
      qrCode,
      onlineUsers: []
    });
    
    await group.save();
    await group.populate('admin', 'username name');

    console.log('✅ Group created:', { groupName, pin, admin: req.userId });

    // Notify all students who have previously joined any of this teacher's sessions
    try {
      const teacher = await User.findById(req.userId);
      const pastGroups = await Group.find({ admin: req.userId }).select('members');
      const studentSet = new Set();
      const studentIds = [];
      pastGroups.forEach(g => {
        (g.members || []).forEach(m => {
          const uid = (m.user?._id || m.user)?.toString();
          if (uid && uid !== req.userId.toString() && !studentSet.has(uid)) {
            studentSet.add(uid);
            studentIds.push(m.user?._id || m.user);
          }
        });
      });
      if (studentIds.length > 0) {
        await Notification.createBulkNotifications(studentIds, {
          sender: req.userId,
          type: 'session_started',
          title: '🚀 Live Session Started!',
          message: `${teacher?.name || teacher?.username} just started "${groupName}". PIN: ${pin}`,
          relatedGroup: group._id,
          priority: 'high',
          icon: '🚀',
          metadata: { groupId: group._id.toString(), pin }
        });
        console.log(`📢 Notified ${studentIds.length} students about new session`);
      }
    } catch (notifErr) {
      console.error('Notification error (non-fatal):', notifErr.message);
    }

    res.status(201).json({
      message: 'Group created successfully',
      group: {
        id: group._id,
        groupName: group.groupName,
        pin: group.pin,
        qrCode: group.qrCode,
        admin: group.admin,
        createdAt: group.createdAt
      }
    });
    
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ error: 'Server error creating group' });
  }
});

// ADD THIS - Active quiz check route (fixes FloatingQuizButton 404)
app.get('/api/quiz/group/:groupId/active', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    // Return no active session for now
    res.json({ session: null });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ✅ FIX 2: JOIN GROUP ROUTE - Enhanced logging and PIN sanitization
app.post('/api/groups/join', optionalAuth, async (req, res) => {
  try {
    const { pin, name, email } = req.body;
    
    // ✅ LOG 1: Incoming request
    console.log('📥 Join request received:', { 
      pin: pin ? `${pin.substring(0, 2)}****` : 'MISSING',
      name: name || 'N/A', 
      email: email ? email.substring(0, 3) + '***' : 'N/A',
      hasAuth: !!req.userId,
      userId: req.userId || 'guest'
    });
    
    // ✅ VALIDATE PIN EXISTS
    if (!pin) {
      console.log('❌ Join failed: PIN missing');
      return res.status(400).json({ error: 'PIN is required' });
    }
    
    // ✅ CLEAN PIN (remove spaces, trim, convert to string)
    const cleanPin = String(pin).trim().replace(/\s+/g, '');
    
    console.log('🧹 Cleaned PIN:', cleanPin, `(original: "${pin}")`);
    
    // ✅ VALIDATE PIN FORMAT
    if (!/^\d{6}$/.test(cleanPin)) {
      console.log('❌ Join failed: Invalid PIN format');
      console.log('   Expected: 6 digits, Got:', cleanPin);
      return res.status(400).json({ 
        error: 'PIN must be exactly 6 digits',
        received: cleanPin.length + ' characters' 
      });
    }
    
    console.log('🔍 Searching for group with PIN:', cleanPin);
    
    // ✅ FIND GROUP
    const group = await Group.findOne({ pin: cleanPin, isActive: true });
    
    if (!group) {
      console.log('❌ Join failed: Group not found or inactive');
      console.log('   Searched PIN:', cleanPin);
      
      // Check if group exists but is inactive
      const inactiveGroup = await Group.findOne({ pin: cleanPin, isActive: false });
      if (inactiveGroup) {
        console.log('   Found inactive group:', inactiveGroup.groupName);
        return res.status(404).json({ error: 'This session has ended' });
      }
      
      return res.status(404).json({ error: 'Invalid PIN or session not found' });
    }
    
    console.log('✅ Group found:', group.groupName, '(ID:', group._id + ')');
    
    // ============================================
    // AUTHENTICATED USER JOIN
    // ============================================
    if (req.userId) {
      console.log('👤 Authenticated join for user:', req.userId);
      
      // Check if already a member
      if (group.isMember(req.userId)) {
        console.log('✅ User already a member');
        
        await group.populate('admin', 'username name');
        await group.populate('members.user', 'username name isOnline');
        
        return res.json({
          message: 'Already a member',
          group: {
            id: group._id,
            groupName: group.groupName,
            pin: group.pin,
            admin: group.admin,
            members: group.members,
            isActive: group.isActive
          }
        });
      }
      // Find: const group = await Group.findOne({ pin: cleanPin, isActive: true });

      // RIGHT AFTER finding the group and BEFORE checking if user is member, ADD:

          // ⭐ NEW: Check email whitelist
          if (group.allowedEmails && group.allowedEmails.length > 0) {
            let userEmail;
            
            if (req.userId) {
              // Authenticated user
              const user = await User.findById(req.userId);
              userEmail = user.email;
            } else {
              // Guest user
              userEmail = email;
            }
            
            if (!group.isEmailAllowed(userEmail)) {
              console.log('❌ Join failed: Email not authorized');
              return res.status(403).json({ 
                error: 'Your email is not authorized for this session. Please contact the teacher.' 
              });
            }
            
            console.log('✅ Email authorized:', userEmail);
          }
      
      // Add as member
      console.log('➕ Adding user to group');
      await group.addMember(req.userId);
      
      await group.populate('admin', 'username name');
      await group.populate('members.user', 'username name isOnline');
      
      console.log('✅ User joined successfully');
      
      return res.json({
        message: 'Joined group successfully',
        group: {
          id: group._id,
          groupName: group.groupName,
          pin: group.pin,
          admin: group.admin,
          members: group.members,
          isActive: group.isActive
        }
      });
    }
    
    // ============================================
    // GUEST USER JOIN
    // ============================================
    console.log('👥 Guest join attempt');
    
    if (!name || !email) {
      console.log('❌ Guest join failed: Name or email missing');
      return res.status(400).json({ 
        error: 'Name and email are required for guest join' 
      });
    }
    
    const emailNorm = email.trim().toLowerCase();
    
    console.log('🔍 Checking if user exists with email:', emailNorm);
    
    let student = await User.findOne({ email: emailNorm });
    
    if (!student) {
      console.log('👤 Creating new student user');
      
      const usernameBase = name.trim().replace(/\s+/g, '_').replace(/[^\w\-._]/g, '').slice(0, 30) || 'student';
      let username = usernameBase;
      let suffix = 0;
      
      while (await User.findOne({ username })) {
        suffix++;
        username = `${usernameBase}_${suffix}`;
        if (suffix > 100) break;
      }
      
      const randomPass = crypto.randomBytes(8).toString('hex');
      
      student = new User({
        username,
        email: emailNorm,
        password: randomPass,
        name: name.trim(),
        role: 'student'
      });
      
      await student.save();
      console.log('✅ New student created:', username);
    } else {
      console.log('✅ Existing user found:', student.username);
    }
    
    // Add to group if not already member
    if (!group.isMember(student._id)) {
      console.log('➕ Adding guest to group');
      await group.addMember(student._id);
    } else {
      console.log('ℹ️ Guest already a member');
    }
    
    const token = generateToken(student._id);
    
    await group.populate('admin', 'username name');
    await group.populate('members.user', 'username name isOnline');
    
    console.log('✅ Guest joined successfully:', student.name);
    
    res.json({
      message: 'Joined group successfully',
      token,
      user: {
        id: student._id.toString(),
        username: student.username,
        email: student.email,
        name: student.name,
        role: student.role
      },
      group: {
        id: group._id,
        groupName: group.groupName,
        pin: group.pin,
        admin: group.admin,
        members: group.members,
        isActive: group.isActive
      }
    });
    
  } catch (error) {
    console.error('❌ Join group error:', error);
    console.error('   Stack:', error.stack);
    res.status(500).json({ 
      error: 'Server error joining group',
      details: error.message 
    });
  }
});

// GET MY GROUPS
app.get('/api/groups/my-groups', authenticateToken, async (req, res) => {
  try {
    const groups = await Group.find({
      'members.user': req.userId,
      // ✅ NEW: a "quick quiz" classroom (auto-created by "Create New Quiz" with no
      // classroom open) is hidden from the TEACHER who created it (admin) so it doesn't
      // clutter "My Classes" — but a student who joined it still needs to find their
      // session here, so it stays visible to everyone else.
      $or: [
        { isQuickQuiz: { $ne: true } },
        { isQuickQuiz: true, admin: { $ne: req.userId } }
      ]
    })
    .populate('admin', 'username name')
    .populate('members.user', 'username name isOnline')
    .sort({ createdAt: -1 })
    .lean(); // skip Mongoose document wrapper overhead — this endpoint is read-only

    const groupsWithJoinedAt = groups.map(group => {
      // With .lean() group is already a plain object — no .toObject() needed
      const currentUserMember = group.members.find(m =>
        m.user && m.user._id && m.user._id.toString() === req.userId.toString()
      );
      return {
        ...group,
        userJoinedAt: currentUserMember ? currentUserMember.joinedAt : null
      };
    });
    
    res.json({ groups: groupsWithJoinedAt });
    
  } catch (error) {
    console.error('Get groups error:', error);
    res.status(500).json({ error: 'Server error fetching groups' });
  }
});

// GET GROUP DETAILS
app.get('/api/groups/:groupId', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    
    const group = await Group.findById(groupId)
      .populate('admin', 'username name')
      .populate('members.user', 'username name isOnline')
      .populate('onlineUsers', 'username');
    
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    if (!group.isMember(req.userId)) {
      return res.status(403).json({ error: 'You are not a member of this group' });
    }
    
    // ✅ Check if session is still active
    if (!group.isActive) {
      return res.status(403).json({ error: 'This session has ended' });
    }
    
    res.json({ group });
    
  } catch (error) {
    console.error('Get group error:', error);
    res.status(500).json({ error: 'Server error fetching group' });
  }
});

// END SESSION
app.post('/api/groups/:groupId/end', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    if (!group.isAdmin(req.userId)) {
      return res.status(403).json({ error: 'Only admin can end the session' });
    }
    
    await group.endSession();
    
    console.log('🔴 Session ended:', groupId);
    
    io.to(groupId).emit('sessionEnded', {
      message: 'The admin has ended this session',
      groupId: group._id
    });
    
    res.json({ message: 'Session ended successfully' });
    
  } catch (error) {
    console.error('End session error:', error);
    res.status(500).json({ error: 'Server error ending session' });
  }
});

// ------------------
// MESSAGE ROUTES
// ------------------

app.get('/api/groups/:groupId/messages', authenticateToken, async (req, res) => {
  try {
    const { groupId } = req.params;
    
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    if (!group.isMember(req.userId)) {
      return res.status(403).json({ error: 'You are not a member of this group' });
    }
    
    const messages = await Message.find({ group: groupId })
      .populate('sender', 'username name isOnline')
      .sort({ createdAt: 1 })
      .limit(100);
    
    res.json({ messages });
    
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Server error fetching messages' });
  }
});

// ============================================
// SOCKET.IO - REAL-TIME COMMUNICATION
// ============================================

io.on('connection', (socket) => {
  console.log('✅ User connected:', socket.id);
  
  socket.userId = null;
  
  // AUTHENTICATION
  socket.on('authenticate', async (token) => {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;

      // Join personal room so the user receives targeted notifications
      socket.join(socket.userId.toString());

      await User.findByIdAndUpdate(socket.userId, {
        socketId: socket.id,
        isOnline: true,
        lastSeen: new Date()
      });

      console.log(`✅ User ${socket.userId} authenticated`);
      socket.emit('authenticated', { success: true });
      
    } catch (error) {
      console.error('Socket authentication error:', error);
      socket.emit('authError', { error: 'Invalid token' });
    }
  });
  
  // JOIN GROUP
  socket.on('joinGroup', async (groupId) => {
    try {
      if (!socket.userId) {
        console.log('❌ Join group failed: Not authenticated');
        return socket.emit('error', { error: 'Not authenticated' });
      }
      
      console.log(`📂 User ${socket.userId} joining group ${groupId}`);
      
      const group = await Group.findById(groupId);
      
      if (!group) {
        console.log('❌ Group not found');
        return socket.emit('error', { error: 'Group not found' });
      }
      
      if (!group.isActive) {
        console.log('❌ Session has ended');
        return socket.emit('error', { error: 'This session has ended' });
      }
      
      if (!group.isMember(socket.userId)) {
        console.log('❌ User not a member');
        return socket.emit('error', { error: 'Access denied' });
      }
      
      socket.join(groupId);
      
      if (!group.onlineUsers.includes(socket.userId)) {
        group.onlineUsers.push(socket.userId);
        await group.save();
      }
      
      const user = await User.findById(socket.userId);
      
      socket.to(groupId).emit('userJoined', {
        userId: socket.userId,
        username: user.username,
        timestamp: new Date()
      });
      
      socket.emit('joinedGroup', { groupId });
      
      await group.populate('onlineUsers', 'username');
      io.to(groupId).emit('onlineUsersUpdate', {
        onlineUsers: group.onlineUsers
      });
      
      console.log(`✅ User ${socket.userId} joined group ${groupId}`);
      
    } catch (error) {
      console.error('Join group error:', error);
      socket.emit('error', { error: 'Failed to join group' });
    }
  });
  
  // LEAVE GROUP
  socket.on('leaveGroup', async (groupId) => {
    try {
      if (!socket.userId) return;
      
      const group = await Group.findById(groupId);
      if (!group) return;
      
      group.onlineUsers = group.onlineUsers.filter(
        userId => userId.toString() !== socket.userId.toString()
      );
      await group.save();
      
      socket.leave(groupId);
      
      await group.populate('onlineUsers', 'username');
      io.to(groupId).emit('onlineUsersUpdate', {
        onlineUsers: group.onlineUsers
      });
      
      console.log(`👋 User ${socket.userId} left group ${groupId}`);
      
    } catch (error) {
      console.error('Leave group error:', error);
    }
  });
  
  // SEND MESSAGE
  socket.on('sendMessage', async (data) => {
    try {
      if (!socket.userId) {
        return socket.emit('error', { error: 'Not authenticated' });
      }
      
      const { groupId, content, messageType, recipientId, fileUrl, fileName, fileSize, fileType } = data;
      
      const group = await Group.findById(groupId);
      if (!group || !group.isMember(socket.userId)) {
        return socket.emit('error', { error: 'Access denied' });
      }
      
      const message = new Message({
        group: groupId,
        sender: socket.userId,
        content,
        messageType: messageType || 'text',
        recipient: recipientId || null,
        fileUrl: fileUrl || null,
        fileName: fileName || null,
        fileSize: fileSize || null,
        fileType: fileType || null
      });
      
      await message.save();
      
      await message.populate('sender', 'username name isOnline');
      if (recipientId) {
        await message.populate('recipient', 'username');
      }
      
      if (messageType === 'private' && recipientId) {
        const recipient = await User.findById(recipientId);
        if (recipient && recipient.socketId) {
          io.to(recipient.socketId).emit('newMessage', message);
        }
        socket.emit('newMessage', message);
      } else {
        io.to(groupId).emit('newMessage', message);
      }
      
    } catch (error) {
      console.error('Send message error:', error);
      socket.emit('error', { error: 'Failed to send message' });
    }
  });
  // Find: socket.on('sendMessage', async (data) => { ... });

  // AFTER the entire sendMessage handler, ADD:

    // ⭐ NEW: POLL VOTING
    socket.on('votePoll', async (data) => {
      try {
        if (!socket.userId) {
          return socket.emit('error', { error: 'Not authenticated' });
        }
        
        const { messageId, optionIndex, groupId } = data;
        
        // Find the poll message
        const message = await Message.findById(messageId);
        if (!message) {
          return socket.emit('error', { error: 'Poll not found' });
        }
        
        // Check if user is in the group
        const group = await Group.findById(groupId || message.group);
        if (!group || !group.isMember(socket.userId)) {
          return socket.emit('error', { error: 'Access denied' });
        }
        
        // Check if poll options exist
        if (!message.pollOptions || !message.pollOptions[optionIndex]) {
          return socket.emit('error', { error: 'Invalid poll option' });
        }
        
        // Remove previous vote if exists
        message.pollOptions.forEach(option => {
          if (!option.votes) option.votes = [];
          option.votes = option.votes.filter(
            voterId => voterId.toString() !== socket.userId.toString()
          );
        });
        
        // Add new vote
        if (!message.pollOptions[optionIndex].votes) {
          message.pollOptions[optionIndex].votes = [];
        }
        message.pollOptions[optionIndex].votes.push(socket.userId);
        
        // Save updated poll
        await message.save();
        await message.populate('sender', 'username name');
        
        // Broadcast updated poll to all group members
        io.to(message.group.toString()).emit('pollUpdated', message);
        
        console.log(`✅ User ${socket.userId} voted on poll ${messageId}`);
        
      } catch (error) {
        console.error('Vote poll error:', error);
        socket.emit('error', { error: 'Failed to vote' });
      }
    });
  
  // EDIT MESSAGE
  socket.on('editMessage', async (data) => {
    try {
      if (!socket.userId) return;
      
      const { messageId, newContent } = data;
      
      const message = await Message.findById(messageId);
      if (!message) {
        return socket.emit('error', { error: 'Message not found' });
      }
      
      if (message.sender.toString() !== socket.userId.toString()) {
        return socket.emit('error', { error: 'Can only edit your own messages' });
      }
      
      message.content = newContent;
      message.isEdited = true;
      message.editedAt = new Date();
      await message.save();
      
      await message.populate('sender', 'username name isOnline');
      
      io.to(message.group.toString()).emit('messageEdited', message);
      
    } catch (error) {
      console.error('Edit message error:', error);
      socket.emit('error', { error: 'Failed to edit message' });
    }
  });
  
  // DELETE MESSAGE
  socket.on('deleteMessage', async (data) => {
    try {
      if (!socket.userId) return;
      
      const { messageId } = data;
      
      const message = await Message.findById(messageId);
      if (!message) {
        return socket.emit('error', { error: 'Message not found' });
      }
      
      if (message.sender.toString() !== socket.userId.toString()) {
        return socket.emit('error', { error: 'Can only delete your own messages' });
      }
      
      message.isDeleted = true;
      message.content = 'This message was deleted';
      await message.save();
      
      io.to(message.group.toString()).emit('messageDeleted', {
        messageId: message._id,
        groupId: message.group
      });
      
    } catch (error) {
      console.error('Delete message error:', error);
      socket.emit('error', { error: 'Failed to delete message' });
    }
  });
  
  // TYPING INDICATORS
  socket.on('typing', async (data) => {
    try {
      if (!socket.userId) return;
      
      const { groupId } = data;
      const user = await User.findById(socket.userId);
      
      socket.to(groupId).emit('userTyping', {
        userId: socket.userId,
        username: user.username
      });
      
    } catch (error) {
      console.error('Typing indicator error:', error);
    }
  });
  
  socket.on('stopTyping', async (data) => {
    try {
      if (!socket.userId) return;
      
      const { groupId } = data;
      const user = await User.findById(socket.userId);
      
      socket.to(groupId).emit('userStopTyping', {
        userId: socket.userId,
        username: user.username
      });
      
    } catch (error) {
      console.error('Stop typing error:', error);
    }
  });
  
  // DISCONNECT
  socket.on('disconnect', async () => {
    try {
      if (socket.userId) {
        await User.findByIdAndUpdate(socket.userId, {
          isOnline: false,
          lastSeen: new Date(),
          socketId: null
        });
        
        await Group.updateMany(
          { onlineUsers: socket.userId },
          { $pull: { onlineUsers: socket.userId } }
        );
        
        console.log(`👋 User ${socket.userId} disconnected`);
      }
      
    } catch (error) {
      console.error('Disconnect error:', error);
    }
  });
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.PORT || 5000;

// ✅ START SERVER FIRST (IMPORTANT)
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// ✅ THEN CONNECT DB (non-blocking)

// ============================================
// GRACEFUL SHUTDOWN (Add at bottom of file)
// ============================================

// Clean up jobs on server shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  
  // Stop reminder job
  if (process.reminderJobId) {
    const { stopSessionReminderJob } = require('./jobs/sessionReminder');
    stopSessionReminderJob(process.reminderJobId);
  }
  
  // Close server
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});