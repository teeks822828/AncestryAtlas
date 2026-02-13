const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { eventQueries, photoQueries, commentQueries, userQueries, notificationQueries, gedcomPeopleQueries, gedcomFamilyQueries } = require('../models/database');
const { authenticateToken } = require('../middleware/auth');
const { parseGedcom, parseGedcomFull } = require('../utils/gedcomParser');
const { geocodeAll } = require('../utils/geocoder');

const router = express.Router();

// Configure multer for photo uploads
const uploadsDir = process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) return cb(null, true);
    cb(new Error('Only image files are allowed'));
  }
});

// Configure multer for GEDCOM file uploads (in-memory, 10MB limit)
const gedcomUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.ged' || ext === '.gedcom') return cb(null, true);
    cb(new Error('Only .ged files are allowed'));
  }
});

// All routes require authentication
router.use(authenticateToken);

// POST /api/events/import-gedcom - Import events from GEDCOM file
router.post('/import-gedcom', (req, res) => {
  gedcomUpload.single('gedcom')(req, res, async (multerErr) => {
    if (multerErr) {
      return res.status(400).json({ error: multerErr.message || 'File upload error' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No .ged file uploaded' });
    }

    try {
      const content = req.file.buffer.toString('utf-8');
      const { events: parsedEvents, people: parsedPeople, families: parsedFamilies } = parseGedcomFull(content);

      // Clear previous GEDCOM data for this user
      gedcomFamilyQueries.deleteByUserId(req.user.id);
      gedcomPeopleQueries.deleteByUserId(req.user.id);

      // Store people in gedcom_people table
      for (const person of parsedPeople) {
        gedcomPeopleQueries.create(
          req.user.id, person.gedcomId, person.name,
          person.birthDate, person.birthPlace,
          person.deathDate, person.deathPlace, person.sex
        );
      }

      // Store families in gedcom_families + gedcom_children tables
      for (const fam of parsedFamilies) {
        const famResult = gedcomFamilyQueries.create(
          req.user.id, fam.gedcomFamId, fam.husbandId, fam.wifeId
        );
        for (const childId of fam.childIds) {
          gedcomFamilyQueries.createChild(famResult.lastInsertRowid, childId);
        }
      }

      if (parsedEvents.length === 0) {
        return res.json({
          imported: 0, skipped: 0, people: parsedPeople.map(p => p.name).sort(),
          peopleCount: parsedPeople.length, familiesCount: parsedFamilies.length,
          message: `No geocodable events found. Stored ${parsedPeople.length} people and ${parsedFamilies.length} family links.`
        });
      }

      // Collect unique places for geocoding
      const places = parsedEvents.map(e => e.place);
      const geocoded = await geocodeAll(places);

      let imported = 0;
      let skipped = 0;
      const peopleSet = new Set();

      for (const evt of parsedEvents) {
        const coords = geocoded.get(evt.place);
        if (!coords) {
          skipped++;
          continue;
        }

        eventQueries.createWithSource(
          req.user.id,
          evt.title,
          evt.description || null,
          evt.date,
          null,
          coords.lat,
          coords.lon,
          evt.category || 'other',
          'gedcom'
        );

        imported++;
        peopleSet.add(evt.name);
      }

      res.json({
        imported,
        skipped,
        people: [...peopleSet].sort(),
        peopleCount: parsedPeople.length,
        familiesCount: parsedFamilies.length,
        message: `Successfully imported ${imported} events for ${peopleSet.size} people. Stored ${parsedPeople.length} people and ${parsedFamilies.length} family links.`
      });
    } catch (err) {
      console.error('GEDCOM import error:', err);
      res.status(500).json({ error: 'Failed to import GEDCOM file: ' + err.message });
    }
  });
});

// GET /api/events - Get current user's events (optional ?source= filter)
router.get('/', (req, res) => {
  try {
    const { source } = req.query;
    const events = source
      ? eventQueries.findByUserIdAndSource(req.user.id, source)
      : eventQueries.findByUserId(req.user.id);
    // Attach photos to each event
    const eventsWithPhotos = events.map(e => ({
      ...e,
      photos: photoQueries.findByEventId(e.id)
    }));
    res.json({ events: eventsWithPhotos });
  } catch (err) {
    console.error('Get events error:', err);
    res.status(500).json({ error: 'Failed to get events' });
  }
});

// POST /api/events - Create new event
router.post('/', (req, res) => {
  try {
    const { title, description, event_date, end_date, latitude, longitude, category } = req.body;

    if (!title || !event_date || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'Title, event_date, latitude, and longitude are required' });
    }

    const result = eventQueries.create(
      req.user.id, title, description || null,
      event_date, end_date || null,
      latitude, longitude, category || 'other'
    );

    const newEvent = eventQueries.findById(result.lastInsertRowid);
    newEvent.photos = [];
    res.status(201).json({ event: newEvent });
  } catch (err) {
    console.error('Create event error:', err);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// PUT /api/events/:id - Update event
router.put('/:id', (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const { title, description, event_date, end_date, latitude, longitude, category } = req.body;

    const existingEvent = eventQueries.findById(eventId);
    if (!existingEvent) return res.status(404).json({ error: 'Event not found' });
    if (existingEvent.user_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });

    if (!title || !event_date || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'Title, event_date, latitude, and longitude are required' });
    }

    eventQueries.update(
      title, description || null,
      event_date, end_date || null,
      latitude, longitude, category || 'other', eventId
    );

    const updatedEvent = eventQueries.findById(eventId);
    updatedEvent.photos = photoQueries.findByEventId(eventId);
    res.json({ event: updatedEvent });
  } catch (err) {
    console.error('Update event error:', err);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// GET /api/events/gedcom-tree - Get GEDCOM tree data for D3 rendering
router.get('/gedcom-tree', (req, res) => {
  try {
    const people = gedcomPeopleQueries.findByUserId(req.user.id);
    const families = gedcomFamilyQueries.findByUserId(req.user.id);

    // Build children lookup for each family
    const familiesWithChildren = families.map(fam => {
      const children = gedcomFamilyQueries.findChildrenByFamilyId(fam.id);
      return {
        gedcomFamId: fam.gedcom_fam_id,
        husbandId: fam.husband_gedcom_id,
        wifeId: fam.wife_gedcom_id,
        childIds: children.map(c => c.child_gedcom_id)
      };
    });

    res.json({ people, families: familiesWithChildren });
  } catch (err) {
    console.error('Get GEDCOM tree error:', err);
    res.status(500).json({ error: 'Failed to get GEDCOM tree data' });
  }
});

// DELETE /api/events/gedcom - Clear all GEDCOM events and tree data for current user
router.delete('/gedcom', (req, res) => {
  try {
    gedcomFamilyQueries.deleteByUserId(req.user.id);
    gedcomPeopleQueries.deleteByUserId(req.user.id);
    const result = eventQueries.deleteByUserIdAndSource(req.user.id, 'gedcom');
    res.json({ message: `Deleted ${result.changes} GEDCOM events and all tree data` });
  } catch (err) {
    console.error('Clear GEDCOM events error:', err);
    res.status(500).json({ error: 'Failed to clear GEDCOM events' });
  }
});

// DELETE /api/events/:id - Delete event
router.delete('/:id', (req, res) => {
  try {
    const eventId = parseInt(req.params.id);

    const existingEvent = eventQueries.findById(eventId);
    if (!existingEvent) return res.status(404).json({ error: 'Event not found' });
    if (existingEvent.user_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });

    // Delete associated photo files
    const photos = photoQueries.findByEventId(eventId);
    photos.forEach(p => {
      const filepath = path.join(uploadsDir, p.filename);
      if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    });

    eventQueries.delete(eventId);
    res.json({ message: 'Event deleted successfully' });
  } catch (err) {
    console.error('Delete event error:', err);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// POST /api/events/:id/photos - Upload photos to event
router.post('/:id/photos', (req, res) => {
  upload.array('photos', 10)(req, res, (multerErr) => {
    if (multerErr) {
      console.error('Multer error:', multerErr);
      return res.status(400).json({ error: multerErr.message || 'File upload error' });
    }

    try {
      const eventId = parseInt(req.params.id);
      const event = eventQueries.findById(eventId);
      if (!event) return res.status(404).json({ error: 'Event not found' });
      if (event.user_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }

      const photos = [];
      for (const file of req.files) {
        const result = photoQueries.create(eventId, file.filename, file.originalname);
        photos.push(photoQueries.findById(result.lastInsertRowid));
      }

      res.status(201).json({ photos });
    } catch (err) {
      console.error('Upload photo error:', err);
      res.status(500).json({ error: 'Failed to upload photos' });
    }
  });
});

// DELETE /api/events/:eventId/photos/:photoId - Delete a photo
router.delete('/:eventId/photos/:photoId', (req, res) => {
  try {
    const eventId = parseInt(req.params.eventId);
    const photoId = parseInt(req.params.photoId);

    const event = eventQueries.findById(eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (event.user_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });

    const photo = photoQueries.findById(photoId);
    if (!photo) return res.status(404).json({ error: 'Photo not found' });

    const filepath = path.join(uploadsDir, photo.filename);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);

    photoQueries.delete(photoId);
    res.json({ message: 'Photo deleted' });
  } catch (err) {
    console.error('Delete photo error:', err);
    res.status(500).json({ error: 'Failed to delete photo' });
  }
});

// GET /api/events/:id/comments - Get event comments
router.get('/:id/comments', (req, res) => {
  try {
    const eventId = parseInt(req.params.id);

    // Verify user can access this event (own event or family member's event)
    const event = eventQueries.findById(eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const currentUser = userQueries.findById(req.user.id);
    const eventOwner = userQueries.findById(event.user_id);

    if (event.user_id !== req.user.id && currentUser.family_id !== eventOwner.family_id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const comments = commentQueries.findByEventId(eventId);
    res.json({ comments });
  } catch (err) {
    console.error('Get comments error:', err);
    res.status(500).json({ error: 'Failed to get comments' });
  }
});

// POST /api/events/:id/comments - Add comment
router.post('/:id/comments', (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'Comment text is required' });

    const event = eventQueries.findById(eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const currentUser = userQueries.findById(req.user.id);
    const eventOwner = userQueries.findById(event.user_id);

    if (event.user_id !== req.user.id && currentUser.family_id !== eventOwner.family_id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const result = commentQueries.create(eventId, req.user.id, text.trim());

    // Notify event owner if commenter is someone else
    if (event.user_id !== req.user.id) {
      const commenterName = currentUser.name || req.user.name;
      notificationQueries.create(
        event.user_id,
        'comment',
        `${commenterName} commented on your event "${event.title}"`,
        JSON.stringify({ eventId, commenterId: req.user.id })
      );
    }

    const comments = commentQueries.findByEventId(eventId);
    res.status(201).json({ comments });
  } catch (err) {
    console.error('Add comment error:', err);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// DELETE /api/events/:eventId/comments/:commentId - Delete own comment
router.delete('/:eventId/comments/:commentId', (req, res) => {
  try {
    const commentId = parseInt(req.params.commentId);
    const comment = commentQueries.findById(commentId);
    if (!comment) return res.status(404).json({ error: 'Comment not found' });
    if (comment.user_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });

    commentQueries.delete(commentId);
    res.json({ message: 'Comment deleted' });
  } catch (err) {
    console.error('Delete comment error:', err);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

module.exports = router;
