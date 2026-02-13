import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEvents } from '../context/EventContext';
import MapView from '../components/Map/MapView';
import LocationSearch from '../components/Map/LocationSearch';
import TimelineSlider from '../components/Timeline/TimelineSlider';
import EventForm from '../components/Events/EventForm';
import EventCard from '../components/Events/EventCard';
import EventDetail from '../components/Events/EventDetail';
import FamilyPanel from '../components/Family/FamilyPanel';
import { notificationsApi, eventsApi } from '../hooks/useApi';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const {
    events,
    familyEvents,
    selectedEvent,
    loading,
    viewingMember,
    setSelectedEvent,
    fetchEvents,
    fetchFamilyEvents,
    fetchMemberEvents,
    createEvent,
    updateEvent,
    deleteEvent,
    clearViewingMember,
  } = useEvents();

  const [isAddingEvent, setIsAddingEvent] = useState(false);
  const [clickedPosition, setClickedPosition] = useState(null);
  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [showEventDetail, setShowEventDetail] = useState(false);
  const [mapCenter, setMapCenter] = useState(null);
  const [mapZoom, setMapZoom] = useState(null);
  const [timelineIndex, setTimelineIndex] = useState(0);
  const [memberEvents, setMemberEvents] = useState([]);
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showAllFamily, setShowAllFamily] = useState(false);
  const [searchLocation, setSearchLocation] = useState(null);

  // Fetch user's events on mount
  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Fetch family events when toggle is on
  useEffect(() => {
    if (showAllFamily) {
      fetchFamilyEvents();
    }
  }, [showAllFamily, fetchFamilyEvents]);

  // Poll notifications every 15 seconds
  const fetchNotifications = useCallback(async () => {
    try {
      const response = await notificationsApi.getAll();
      setNotifications(response.data.notifications);
      setUnreadCount(response.data.unreadCount);
    } catch (err) {
      // silently fail
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const handleMarkAllRead = async () => {
    await notificationsApi.markAllRead();
    setUnreadCount(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: 1 })));
  };

  // Get display events (either user's or selected member's)
  const displayEvents = useMemo(() => {
    if (selectedMemberId && memberEvents.length > 0) {
      return memberEvents;
    }
    return events;
  }, [selectedMemberId, memberEvents, events]);

  // Sort events chronologically
  const sortedEvents = useMemo(() => {
    return [...displayEvents].filter(e => e != null).sort((a, b) => new Date(a.event_date) - new Date(b.event_date));
  }, [displayEvents]);

  // Family events for map overlay (exclude user's own)
  const familyMapEvents = useMemo(() => {
    if (!showAllFamily || selectedMemberId) return [];
    return familyEvents
      .filter(e => e && e.user_id !== user?.id)
      .sort((a, b) => new Date(a.event_date) - new Date(b.event_date));
  }, [showAllFamily, familyEvents, user?.id, selectedMemberId]);

  // Update map center when timeline changes
  useEffect(() => {
    if (sortedEvents.length > 0 && sortedEvents[timelineIndex]) {
      const event = sortedEvents[timelineIndex];
      setMapCenter([event.latitude, event.longitude]);
      setMapZoom(13);
      setSelectedEvent(event);
    }
  }, [timelineIndex, sortedEvents, setSelectedEvent]);

  const handleMapClick = (latlng) => {
    if (isAddingEvent) {
      setClickedPosition(latlng);
      setShowEventForm(true);
      setIsAddingEvent(false);
    }
  };

  const handleEventClick = (event) => {
    if (!event) return;
    setSelectedEvent(event);
    const index = sortedEvents.findIndex((e) => e && e.id === event.id);
    if (index !== -1) {
      setTimelineIndex(index);
    }
    setMapCenter([event.latitude, event.longitude]);
    setMapZoom(13);
    setShowEventDetail(true);
  };

  const handleLocationSelect = ({ lat, lon }) => {
    setMapCenter([lat, lon]);
    setMapZoom(15);
    // Use timestamp to ensure a new reference triggers the effect even for same location
    setSearchLocation({ lat, lon, _t: Date.now() });
  };

  const handleEventSubmit = async (data) => {
    try {
      const photos = data._photos || [];
      const eventData = { ...data };
      delete eventData._photos;

      let savedEvent;
      if (editingEvent) {
        savedEvent = await updateEvent(editingEvent.id, eventData);
      } else {
        savedEvent = await createEvent(eventData);
      }

      // Upload photos if any were selected (only for new events)
      if (photos.length > 0 && savedEvent?.id) {
        try {
          const formData = new FormData();
          photos.forEach((file) => formData.append('photos', file));
          await eventsApi.uploadPhotos(savedEvent.id, formData);
          // Refresh events to get photo data
          fetchEvents();
        } catch (photoErr) {
          console.error('Photo upload failed:', photoErr);
          alert('Event saved but photo upload failed. You can add photos later from event details.');
        }
      }

      setShowEventForm(false);
      setEditingEvent(null);
      setClickedPosition(null);
    } catch (error) {
      console.error('Failed to save event:', error);
      alert('Failed to save event: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleEditEvent = (event) => {
    setEditingEvent(event);
    setShowEventForm(true);
    setShowEventDetail(false);
  };

  const handleMemberSelect = async (memberId) => {
    if (memberId === null) {
      setSelectedMemberId(null);
      setMemberEvents([]);
      clearViewingMember();
      setTimelineIndex(0);
    } else {
      setSelectedMemberId(memberId);
      setShowAllFamily(false);
      const events = await fetchMemberEvents(memberId);
      setMemberEvents(events);
      setTimelineIndex(0);
    }
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm relative" style={{ zIndex: 10000 }}>
        <div className="px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-blue-600">Ancestry Atlas</h1>
            {viewingMember && (
              <span className="text-sm text-purple-600 bg-purple-50 px-3 py-1 rounded-full">
                Viewing {viewingMember.name}'s events
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <LocationSearch onLocationSelect={handleLocationSelect} />
            {!selectedMemberId && (
              <>
                <button
                  onClick={() => setIsAddingEvent(!isAddingEvent)}
                  className={`px-4 py-2 rounded transition-colors whitespace-nowrap ${
                    isAddingEvent
                      ? 'bg-red-500 text-white hover:bg-red-600'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {isAddingEvent ? 'Cancel' : '+ Add Event'}
                </button>
              </>
            )}
            <Link
              to="/family-tree"
              className="px-4 py-2 rounded transition-colors whitespace-nowrap bg-green-600 text-white hover:bg-green-700 text-sm"
            >
              Family Tree
            </Link>
            <Link
              to="/tree"
              className="px-4 py-2 rounded transition-colors whitespace-nowrap bg-indigo-600 text-white hover:bg-indigo-700 text-sm"
            >
              Tree View
            </Link>

            {/* Notification Bell */}
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 text-gray-500 hover:text-gray-700"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 flex items-center justify-center rounded-full">
                    {unreadCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden" style={{ zIndex: 10000 }}>
                  <div className="flex justify-between items-center px-4 py-2 bg-gray-50 border-b">
                    <span className="font-semibold text-sm text-gray-700">Notifications</span>
                    {unreadCount > 0 && (
                      <button onClick={handleMarkAllRead} className="text-xs text-blue-600 hover:underline">
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-64 overflow-auto">
                    {notifications.length === 0 ? (
                      <p className="text-gray-500 text-sm p-4 text-center">No notifications</p>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          className={`px-4 py-3 border-b border-gray-100 text-sm ${
                            n.read ? 'bg-white' : 'bg-blue-50'
                          }`}
                        >
                          <p className="text-gray-800">{n.message}</p>
                          <p className="text-xs text-gray-400 mt-1">
                            {new Date(n.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <Link to="/profile" className="text-gray-600 hover:text-gray-800 text-sm">
              {user?.name}
            </Link>
            <button
              onClick={logout}
              className="text-gray-500 hover:text-gray-700 text-sm"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div
          className={`bg-gray-50 border-r border-gray-200 transition-all ${
            showSidebar ? 'w-80' : 'w-0'
          } overflow-hidden flex flex-col`}
        >
          <div className="flex-1 overflow-auto">
            {/* Show all family toggle */}
            {!selectedMemberId && user?.familyId && (
              <div className="px-4 pt-3 pb-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showAllFamily}
                    onChange={(e) => setShowAllFamily(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700">Show all family events on map</span>
                </label>
              </div>
            )}

            {/* Events List */}
            <div className="p-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-800 mb-3">
                {viewingMember ? `${viewingMember.name}'s Events` : 'Your Events'}
              </h2>
              {loading ? (
                <p className="text-gray-500">Loading events...</p>
              ) : sortedEvents.length === 0 ? (
                <p className="text-gray-500 text-sm">
                  No events yet. Click "+ Add Event" then click on the map!
                </p>
              ) : (
                <div className="space-y-2 max-h-[40vh] overflow-auto">
                  {sortedEvents.map((event, index) => (
                    event && (
                      <EventCard
                        key={event.id}
                        event={event}
                        index={index}
                        isSelected={selectedEvent && selectedEvent.id === event.id}
                        onClick={handleEventClick}
                        onEdit={handleEditEvent}
                        onDelete={deleteEvent}
                        readOnly={!!selectedMemberId}
                      />
                    )
                  ))}
                </div>
              )}
            </div>

            {/* Family Panel */}
            <FamilyPanel
              onMemberSelect={handleMemberSelect}
              selectedMemberId={selectedMemberId}
            />
          </div>
        </div>

        {/* Sidebar Toggle */}
        <button
          onClick={() => setShowSidebar(!showSidebar)}
          className="absolute left-0 top-1/2 transform -translate-y-1/2 bg-white border border-gray-200 rounded-r-lg px-1 py-4 z-20 shadow hover:bg-gray-50"
          style={{ left: showSidebar ? '318px' : '0' }}
        >
          {showSidebar ? '<' : '>'}
        </button>

        {/* Map Area */}
        <div className="flex-1 flex flex-col">
          <div className="flex-1">
            <MapView
              events={!selectedMemberId ? sortedEvents : []}
              familyEvents={selectedMemberId
                ? [...memberEvents].sort((a, b) => new Date(a.event_date) - new Date(b.event_date))
                : familyMapEvents
              }
              selectedEvent={selectedEvent}
              onEventClick={handleEventClick}
              onMapClick={handleMapClick}
              isAddingEvent={isAddingEvent}
              mapCenter={mapCenter}
              mapZoom={mapZoom}
              searchLocation={searchLocation}
              showLines={true}
              currentLineIndex={timelineIndex}
            />
          </div>

          {/* Timeline */}
          {sortedEvents.length > 0 && (
            <TimelineSlider
              events={sortedEvents}
              currentIndex={timelineIndex}
              onIndexChange={setTimelineIndex}
            />
          )}
        </div>
      </div>

      {/* Event Form Modal */}
      {showEventForm && (
        <EventForm
          position={clickedPosition}
          initialData={editingEvent}
          onSubmit={handleEventSubmit}
          onCancel={() => {
            setShowEventForm(false);
            setEditingEvent(null);
            setClickedPosition(null);
          }}
        />
      )}

      {/* Event Detail Modal */}
      {showEventDetail && selectedEvent && (
        <EventDetail
          event={selectedEvent}
          onClose={() => setShowEventDetail(false)}
          onEventUpdated={fetchEvents}
          readOnly={!!selectedMemberId}
        />
      )}

    </div>
  );
}
