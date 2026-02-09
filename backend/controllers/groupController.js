// backend/controllers/groupController.js
const crypto = require('crypto');
const QRCode = require('qrcode');
const Group = require('../models/Group');
const User = require('../models/User');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const PIN_LENGTH = 6;
const MAX_PIN_ATTEMPTS = 8;
const JWT_SECRET = process.env.JWT_SECRET || 'changeme123';

// ... keep generateUniquePin, getIo, makeUniqueUsername, createGroup unchanged ...

// Robust pin extractor: accepts { pin, name, email } or raw string body
function extractPinFromPayload(payload) {
  if (!payload) return "";
  if (typeof payload === "string") return payload.trim();
  if (typeof payload === "object") {
    const p = payload.pin ?? payload?.p ?? "";
    return String(p ?? "").trim();
  }
  return "";
}

exports.joinGroup = async (req, res) => {
  try {
    const payload = req.body ?? {};
    const rawPin = extractPinFromPayload(payload);
    const pin = rawPin ? rawPin.replace(/\D/g, '').slice(0, PIN_LENGTH) : "";

    if (!pin || !/^\d{6}$/.test(pin)) {
      return res.status(400).json({ error: 'PIN is required and must be a 6-digit number' });
    }

    const group = await Group.findOne({ pin })
      .populate('admin', 'username email')
      .populate('members', 'username email role')
      .exec();

    if (!group) return res.status(404).json({ error: 'Invalid PIN' });
    if (!group.isActive) return res.status(410).json({ error: 'This session is expired' });

    const reqUser = req.user;
    if (reqUser && (reqUser.id || reqUser._id)) {
      const userIdStr = (reqUser.id || reqUser._id).toString();
      const already = group.members.some(m => (m._id ? m._id.toString() : m.toString()) === userIdStr);
      if (!already) {
        group.members.push(mongoose.Types.ObjectId(userIdStr));
        await group.save();
      }
      const io = getIo(req);
      if (io) io.emit('userJoined', { groupId: group._id, user: { id: userIdStr, username: reqUser.username || reqUser.name } });
      return res.json({ success: true, group });
    }

    // unauthenticated flow: expect name + email
    const { name, email } = payload || {};
    if (!name || !email) {
      // return group info so frontend can prompt for guest details (existing UX)
      return res.json({ success: true, group });
    }

    const emailNorm = String(email).trim().toLowerCase();
    let student = await User.findOne({ email: emailNorm }).exec();

    if (!student) {
      const usernameCandidate = await makeUniqueUsername(name);
      const randomPass = crypto.randomBytes(6).toString('hex');
      student = new User({
        username: usernameCandidate,
        password: randomPass,
        email: emailNorm,
        role: 'student'
      });
      await student.save();
    }

    const studentIdStr = student._id.toString();
    const isMember = group.members.some(m => (m._id ? m._id.toString() : m.toString()) === studentIdStr);
    if (!isMember) {
      group.members.push(mongoose.Types.ObjectId(studentIdStr));
      await group.save();
    }

    const tokenPayload = { id: student._id.toString(), role: student.role || 'student' };
    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '24h' });

    const io = getIo(req);
    if (io) {
      io.emit('userJoined', { groupId: group._id, user: { id: studentIdStr, username: student.username } });
    }

    const safeUser = {
      id: student._id.toString(),
      username: student.username,
      email: student.email,
      role: student.role
    };

    return res.json({ success: true, token, user: safeUser, group });
  } catch (err) {
    console.error('joinGroup err', err);
    return res.status(500).json({ error: 'Failed to join group' });
  }
};
