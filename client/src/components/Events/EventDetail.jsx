import { useState, useEffect, useRef } from 'react';
import { eventsApi, UPLOADS_URL } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import { getCategoryColor, getCategoryLabel } from '../../constants/categories';

export default function EventDetail({ event, onClose, onEventUpdated, readOnly = false }) {
  const { user } = useAuth();
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [uploading, setUploading] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const fileInputRef = useRef(null);

  const isOwner = event.user_id === user?.id;
  const dateOpts = { year: 'numeric', month: 'long', day: 'numeric' };
  const startDate = new Date(event.event_date).toLocaleDateString('en-US', dateOpts);
  const endDate = event.end_date ? new Date(event.end_date).toLocaleDateString('en-US', dateOpts) : null;

  useEffect(() => {
    loadComments();
  }, [event.id]);

  const loadComments = async () => {
    try {
      const res = await eventsApi.getComments(event.id);
      setComments(res.data.comments);
    } catch (err) {
      // may fail if not in same family, that's ok
    }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    try {
      const res = await eventsApi.addComment(event.id, newComment.trim());
      setComments(res.data.comments);
      setNewComment('');
    } catch (err) {
      console.error('Failed to add comment:', err);
    }
  };

  const handleDeleteComment = async (commentId) => {
    try {
      await eventsApi.deleteComment(event.id, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch (err) {
      console.error('Failed to delete comment:', err);
    }
  };

  const handlePhotoUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      const formData = new FormData();
      for (const file of files) {
        formData.append('photos', file);
      }
      await eventsApi.uploadPhotos(event.id, formData);
      if (onEventUpdated) onEventUpdated();
    } catch (err) {
      console.error('Failed to upload photos:', err);
      alert('Failed to upload photos');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeletePhoto = async (photoId) => {
    if (!confirm('Delete this photo?')) return;
    try {
      await eventsApi.deletePhoto(event.id, photoId);
      if (onEventUpdated) onEventUpdated();
    } catch (err) {
      console.error('Failed to delete photo:', err);
    }
  };

  const photos = event.photos || [];

  return (
    <>
    {/* Lightbox overlay */}
    {lightboxIndex !== null && photos[lightboxIndex] && (
      <div
        className="fixed inset-0 bg-black/90 flex items-center justify-center z-[3000]"
        onClick={() => setLightboxIndex(null)}
      >
        <button
          onClick={(e) => { e.stopPropagation(); setLightboxIndex(null); }}
          className="absolute top-4 right-4 text-white text-3xl hover:text-gray-300 z-10"
        >
          &times;
        </button>
        {photos.length > 1 && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxIndex((lightboxIndex - 1 + photos.length) % photos.length); }}
              className="absolute left-4 text-white text-4xl hover:text-gray-300 z-10"
            >
              &#8249;
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxIndex((lightboxIndex + 1) % photos.length); }}
              className="absolute right-4 text-white text-4xl hover:text-gray-300 z-10"
            >
              &#8250;
            </button>
          </>
        )}
        <img
          src={`${UPLOADS_URL}/${photos[lightboxIndex].filename}`}
          alt={photos[lightboxIndex].original_name}
          className="max-h-[90vh] max-w-[90vw] object-contain"
          onClick={(e) => e.stopPropagation()}
        />
        <div className="absolute bottom-4 text-white text-sm">
          {lightboxIndex + 1} / {photos.length}
        </div>
      </div>
    )}

    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[2000]">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span
                className="inline-block w-3 h-3 rounded-full"
                style={{ backgroundColor: getCategoryColor(event.category) }}
              />
              <span className="text-xs text-gray-500">{getCategoryLabel(event.category)}</span>
            </div>
            <h2 className="text-xl font-bold text-gray-800">{event.title}</h2>
            <p className="text-sm text-gray-500 mt-1">
              {startDate}{endDate ? ` - ${endDate}` : ''}
            </p>
            {event.user_name && (
              <p className="text-xs text-purple-600 mt-1">By {event.user_name}</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* Description */}
          {event.description && (
            <div>
              <p className="text-gray-700">{event.description}</p>
            </div>
          )}

          {/* Location */}
          <div className="text-sm text-gray-500">
            Location: {event.latitude?.toFixed(4)}, {event.longitude?.toFixed(4)}
          </div>

          {/* Photos */}
          <div>
            <h3 className="font-semibold text-gray-700 mb-2">Photos</h3>
            {photos.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {photos.map((photo, idx) => (
                  <div key={photo.id} className="relative group">
                    <img
                      src={`${UPLOADS_URL}/${photo.filename}`}
                      alt={photo.original_name}
                      className="w-full h-24 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => setLightboxIndex(idx)}
                    />
                    {isOwner && (
                      <button
                        onClick={() => handleDeletePhoto(photo.id)}
                        className="absolute top-1 right-1 bg-red-500 text-white w-5 h-5 rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        &times;
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No photos yet</p>
            )}

            {isOwner && (
              <div className="mt-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
                >
                  {uploading ? 'Uploading...' : '+ Add Photos'}
                </button>
              </div>
            )}
          </div>

          {/* Comments */}
          <div>
            <h3 className="font-semibold text-gray-700 mb-2">
              Comments {comments.length > 0 && `(${comments.length})`}
            </h3>

            {comments.length === 0 ? (
              <p className="text-sm text-gray-400">No comments yet</p>
            ) : (
              <div className="space-y-2 mb-3">
                {comments.map((c) => (
                  <div key={c.id} className="bg-gray-50 rounded p-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-sm font-medium text-gray-800">{c.user_name}</span>
                        <span className="text-xs text-gray-400 ml-2">
                          {new Date(c.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      {c.user_id === user?.id && (
                        <button
                          onClick={() => handleDeleteComment(c.id)}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{c.text}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Add comment form */}
            <form onSubmit={handleAddComment} className="flex gap-2">
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a comment..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={!newComment.trim()}
                className="px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                Post
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
