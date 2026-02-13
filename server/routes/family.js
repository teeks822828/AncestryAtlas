const express = require('express');
const { familyQueries, eventQueries, userQueries, requestQueries, notificationQueries, photoQueries, familyRelationshipQueries } = require('../models/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// POST /api/family/create - Create a new family (after registration)
router.post('/create', (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Family name is required' });
    }

    // Check user doesn't already belong to a family
    const user = userQueries.findById(req.user.id);
    if (user.family_id) {
      return res.status(400).json({ error: 'You already belong to a family' });
    }

    const familyResult = familyQueries.create(name, req.user.id);
    const familyId = familyResult.lastInsertRowid;
    userQueries.updateFamily(familyId, req.user.id);

    res.status(201).json({
      message: 'Family created successfully',
      family: { id: familyId, name, host_user_id: req.user.id }
    });
  } catch (err) {
    console.error('Create family error:', err);
    res.status(500).json({ error: 'Failed to create family' });
  }
});

// POST /api/family/request - Request to join a family by host email
router.post('/request', (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Host email is required' });
    }

    // Check user doesn't already belong to a family
    const currentUser = userQueries.findById(req.user.id);
    if (currentUser.family_id) {
      return res.status(400).json({ error: 'You already belong to a family. Leave your current family first.' });
    }

    // Find the host user by email
    const hostUser = userQueries.findPublicByEmail(email);
    if (!hostUser) {
      return res.status(404).json({ error: 'No user found with that email' });
    }

    if (!hostUser.family_id) {
      return res.status(400).json({ error: 'That user has not created a family yet' });
    }

    // Check the target user is actually the host of the family
    const family = familyQueries.findById(hostUser.family_id);
    if (!family || family.host_user_id !== hostUser.id) {
      return res.status(400).json({ error: 'That user is not a family host' });
    }

    // Check if there's already a pending request
    const existing = requestQueries.findByRequesterAndFamily(req.user.id, family.id);
    if (existing) {
      return res.status(400).json({ error: 'You already have a pending request to this family' });
    }

    // Create the request
    requestQueries.create(req.user.id, family.id);

    // Create notification for the host
    notificationQueries.create(
      hostUser.id,
      'family_request',
      `${req.user.name} wants to join your family "${family.name}"`,
      JSON.stringify({ requesterId: req.user.id, requesterName: req.user.name, familyId: family.id })
    );

    res.status(201).json({ message: `Request sent to ${hostUser.name}. They will be notified.` });
  } catch (err) {
    console.error('Family request error:', err);
    res.status(500).json({ error: 'Failed to send join request' });
  }
});

// GET /api/family/requests - Get pending requests (host only)
router.get('/requests', (req, res) => {
  try {
    const user = userQueries.findById(req.user.id);
    if (!user.family_id) {
      return res.json({ requests: [] });
    }

    const family = familyQueries.findById(user.family_id);
    if (!family || family.host_user_id !== req.user.id) {
      return res.json({ requests: [] });
    }

    const requests = requestQueries.findPending(family.id);
    res.json({ requests });
  } catch (err) {
    console.error('Get requests error:', err);
    res.status(500).json({ error: 'Failed to get requests' });
  }
});

// POST /api/family/requests/:id/approve - Approve a join request
router.post('/requests/:id/approve', (req, res) => {
  try {
    const requestId = parseInt(req.params.id);
    const request = requestQueries.findById(requestId);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    // Verify current user is the host
    const family = familyQueries.findById(request.family_id);
    if (!family || family.host_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the family host can approve requests' });
    }

    // Approve: update request status and add user to family
    requestQueries.updateStatus(requestId, 'approved');
    userQueries.updateFamily(request.family_id, request.requester_id);

    // Notify the requester
    const requester = userQueries.findById(request.requester_id);
    notificationQueries.create(
      request.requester_id,
      'request_approved',
      `You have been added to the family "${family.name}"!`,
      JSON.stringify({ familyId: family.id, familyName: family.name })
    );

    res.json({ message: `${requester.name} has been added to the family` });
  } catch (err) {
    console.error('Approve request error:', err);
    res.status(500).json({ error: 'Failed to approve request' });
  }
});

// POST /api/family/requests/:id/deny - Deny a join request
router.post('/requests/:id/deny', (req, res) => {
  try {
    const requestId = parseInt(req.params.id);
    const request = requestQueries.findById(requestId);
    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const family = familyQueries.findById(request.family_id);
    if (!family || family.host_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the family host can deny requests' });
    }

    requestQueries.updateStatus(requestId, 'denied');

    // Notify the requester
    notificationQueries.create(
      request.requester_id,
      'request_denied',
      `Your request to join "${family.name}" was declined.`,
      null
    );

    res.json({ message: 'Request denied' });
  } catch (err) {
    console.error('Deny request error:', err);
    res.status(500).json({ error: 'Failed to deny request' });
  }
});

// GET /api/family/members - List family members
router.get('/members', (req, res) => {
  try {
    const user = userQueries.findById(req.user.id);
    if (!user || !user.family_id) {
      return res.json({ members: [], family: null });
    }

    const family = familyQueries.findById(user.family_id);
    const members = familyQueries.getMembers(user.family_id);
    res.json({ members, family });
  } catch (err) {
    console.error('Get family members error:', err);
    res.status(500).json({ error: 'Failed to get family members' });
  }
});

// GET /api/family/members/:id/events - Get a member's events (read-only)
router.get('/members/:id/events', (req, res) => {
  try {
    const memberId = parseInt(req.params.id);
    const currentUser = userQueries.findById(req.user.id);

    // Verify the member is in the same family
    const member = userQueries.findById(memberId);
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    if (member.family_id !== currentUser.family_id) {
      return res.status(403).json({ error: 'Not authorized to view this member\'s events' });
    }

    const { source } = req.query;
    const events = source
      ? eventQueries.findByUserIdAndSource(memberId, source)
      : eventQueries.findByUserId(memberId);
    const eventsWithPhotos = events.map(e => ({
      ...e,
      photos: photoQueries.findByEventId(e.id)
    }));
    res.json({
      member: { id: member.id, name: member.name },
      events: eventsWithPhotos
    });
  } catch (err) {
    console.error('Get member events error:', err);
    res.status(500).json({ error: 'Failed to get member events' });
  }
});

// GET /api/family/events - Get all family events
router.get('/events', (req, res) => {
  try {
    const user = userQueries.findById(req.user.id);
    if (!user || !user.family_id) {
      return res.json({ events: [] });
    }

    const { source } = req.query;
    const events = source
      ? eventQueries.findByFamilyIdAndSource(user.family_id, source)
      : eventQueries.findByFamilyId(user.family_id);
    const eventsWithPhotos = events.map(e => ({
      ...e,
      photos: photoQueries.findByEventId(e.id)
    }));
    res.json({ events: eventsWithPhotos });
  } catch (err) {
    console.error('Get family events error:', err);
    res.status(500).json({ error: 'Failed to get family events' });
  }
});

// POST /api/family/leave - Leave current family
router.post('/leave', (req, res) => {
  try {
    const user = userQueries.findById(req.user.id);
    if (!user || !user.family_id) {
      return res.status(400).json({ error: 'You are not part of a family' });
    }

    const family = familyQueries.findById(user.family_id);
    if (family && family.host_user_id === req.user.id) {
      return res.status(400).json({ error: 'The family host cannot leave. Transfer ownership or delete the family.' });
    }

    userQueries.updateFamily(null, req.user.id);
    res.json({ message: 'You have left the family' });
  } catch (err) {
    console.error('Leave family error:', err);
    res.status(500).json({ error: 'Failed to leave family' });
  }
});

// POST /api/family/relationships - Set a relationship between two family members
router.post('/relationships', (req, res) => {
  try {
    const { userId, relatedUserId, relationship } = req.body;
    if (!userId || !relatedUserId || !relationship) {
      return res.status(400).json({ error: 'userId, relatedUserId, and relationship are required' });
    }

    const validRelationships = ['parent', 'child', 'spouse'];
    if (!validRelationships.includes(relationship)) {
      return res.status(400).json({ error: 'Relationship must be parent, child, or spouse' });
    }

    const currentUser = userQueries.findById(req.user.id);
    if (!currentUser || !currentUser.family_id) {
      return res.status(400).json({ error: 'You must belong to a family' });
    }

    // Verify the host is making the request
    const family = familyQueries.findById(currentUser.family_id);
    if (!family || family.host_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the family host can set relationships' });
    }

    // Verify both users belong to this family
    const user1 = userQueries.findById(userId);
    const user2 = userQueries.findById(relatedUserId);
    if (!user1 || !user2 || user1.family_id !== family.id || user2.family_id !== family.id) {
      return res.status(400).json({ error: 'Both users must belong to your family' });
    }

    // Remove existing relationship between this pair
    familyRelationshipQueries.deleteByPair(family.id, userId, relatedUserId);

    // Create the relationship and its inverse
    familyRelationshipQueries.create(family.id, userId, relatedUserId, relationship);

    // Auto-create inverse
    const inverseMap = { parent: 'child', child: 'parent', spouse: 'spouse' };
    familyRelationshipQueries.create(family.id, relatedUserId, userId, inverseMap[relationship]);

    const relationships = familyRelationshipQueries.findByFamilyId(family.id);
    res.json({ relationships });
  } catch (err) {
    console.error('Set relationship error:', err);
    res.status(500).json({ error: 'Failed to set relationship' });
  }
});

// GET /api/family/relationships - Get all relationships for the family
router.get('/relationships', (req, res) => {
  try {
    const currentUser = userQueries.findById(req.user.id);
    if (!currentUser || !currentUser.family_id) {
      return res.json({ relationships: [] });
    }

    const relationships = familyRelationshipQueries.findByFamilyId(currentUser.family_id);
    res.json({ relationships });
  } catch (err) {
    console.error('Get relationships error:', err);
    res.status(500).json({ error: 'Failed to get relationships' });
  }
});

// DELETE /api/family/relationships/:id - Delete a relationship (and its inverse)
router.delete('/relationships/:id', (req, res) => {
  try {
    const currentUser = userQueries.findById(req.user.id);
    if (!currentUser || !currentUser.family_id) {
      return res.status(400).json({ error: 'You must belong to a family' });
    }

    const family = familyQueries.findById(currentUser.family_id);
    if (!family || family.host_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the family host can remove relationships' });
    }

    const relId = parseInt(req.params.id);
    // Find the relationship to know the pair, then delete both directions
    const allRels = familyRelationshipQueries.findByFamilyId(family.id);
    const rel = allRels.find(r => r.id === relId);
    if (!rel) {
      return res.status(404).json({ error: 'Relationship not found' });
    }

    familyRelationshipQueries.deleteByPair(family.id, rel.user_id, rel.related_user_id);

    const relationships = familyRelationshipQueries.findByFamilyId(family.id);
    res.json({ relationships });
  } catch (err) {
    console.error('Delete relationship error:', err);
    res.status(500).json({ error: 'Failed to delete relationship' });
  }
});

// GET /api/family/tree - Get live family members structured for tree view
router.get('/tree', (req, res) => {
  try {
    const currentUser = userQueries.findById(req.user.id);
    if (!currentUser || !currentUser.family_id) {
      return res.json({ members: [], relationships: [] });
    }

    const members = familyQueries.getMembers(currentUser.family_id);
    const relationships = familyRelationshipQueries.findByFamilyId(currentUser.family_id);

    res.json({ members, relationships });
  } catch (err) {
    console.error('Get family tree error:', err);
    res.status(500).json({ error: 'Failed to get family tree' });
  }
});

module.exports = router;
