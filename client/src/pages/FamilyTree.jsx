import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEvents } from '../context/EventContext';
import MapView from '../components/Map/MapView';
import LocationSearch from '../components/Map/LocationSearch';
import TimelineSlider from '../components/Timeline/TimelineSlider';
import EventCard from '../components/Events/EventCard';
import EventDetail from '../components/Events/EventDetail';
import FamilyPanel from '../components/Family/FamilyPanel';
import { eventsApi } from '../hooks/useApi';

export default function FamilyTree() {
  const { user } = useAuth();
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
    clearViewingMember,
  } = useEvents();

  const [showEventDetail, setShowEventDetail] = useState(false);
  const [mapCenter, setMapCenter] = useState(null);
  const [mapZoom, setMapZoom] = useState(null);
  const [timelineIndex, setTimelineIndex] = useState(0);
  const [memberEvents, setMemberEvents] = useState([]);
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showAllFamily, setShowAllFamily] = useState(false);
  const [searchLocation, setSearchLocation] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const gedcomInputRef = useRef(null);

  // Handle GEDCOM file import
  const handleGedcomImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setImportLoading(true);
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append('gedcom', file);
      const response = await eventsApi.importGedcom(formData);
      setImportResult(response.data);
      fetchEvents();
    } catch (err) {
      setImportResult({
        error: err.response?.data?.error || err.message || 'Import failed'
      });
    } finally {
      setImportLoading(false);
    }
  };

  // Handle clear all GEDCOM events
  const handleClearAll = async () => {
    if (!confirm('Are you sure you want to delete all your imported GEDCOM events?')) return;
    try {
      await eventsApi.clearGedcom();
      fetchEvents();
    } catch (err) {
      alert('Failed to clear GEDCOM events: ' + (err.response?.data?.error || err.message));
    }
  };

  // Fetch GEDCOM events on mount
  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Fetch family GEDCOM events when toggle is on
  useEffect(() => {
    if (showAllFamily) {
      fetchFamilyEvents();
    }
  }, [showAllFamily, fetchFamilyEvents]);

  // Get display events
  const displayEvents = useMemo(() => {
    if (selectedMemberId && memberEvents.length > 0) {
      return memberEvents;
    }
    return events;
  }, [selectedMemberId, memberEvents, events]);

  const sortedEvents = useMemo(() => {
    return [...displayEvents].filter(e => e != null).sort((a, b) => new Date(a.event_date) - new Date(b.event_date));
  }, [displayEvents]);

  // Family events for map overlay
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
    setSearchLocation({ lat, lon, _t: Date.now() });
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
            <h1 className="text-xl font-bold text-green-700">Family Tree</h1>
            {viewingMember && (
              <span className="text-sm text-purple-600 bg-purple-50 px-3 py-1 rounded-full">
                Viewing {viewingMember.name}'s events
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <LocationSearch onLocationSelect={handleLocationSelect} />
            <button
              onClick={() => gedcomInputRef.current?.click()}
              disabled={importLoading}
              className="px-4 py-2 rounded transition-colors whitespace-nowrap bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 text-sm"
            >
              {importLoading ? 'Importing...' : 'Import GEDCOM'}
            </button>
            <input
              ref={gedcomInputRef}
              type="file"
              accept=".ged,.gedcom"
              onChange={handleGedcomImport}
              className="hidden"
            />
            {events.length > 0 && (
              <button
                onClick={handleClearAll}
                className="px-4 py-2 rounded transition-colors whitespace-nowrap bg-red-500 text-white hover:bg-red-600 text-sm"
              >
                Clear All
              </button>
            )}
            <Link
              to="/tree"
              className="px-4 py-2 rounded transition-colors whitespace-nowrap bg-indigo-600 text-white hover:bg-indigo-700 text-sm"
            >
              Tree View
            </Link>
            <Link
              to="/dashboard"
              className="px-4 py-2 rounded transition-colors whitespace-nowrap bg-blue-600 text-white hover:bg-blue-700 text-sm"
            >
              Dashboard
            </Link>
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
                {viewingMember ? `${viewingMember.name}'s GEDCOM Events` : 'GEDCOM Events'}
              </h2>
              {loading ? (
                <p className="text-gray-500">Loading events...</p>
              ) : sortedEvents.length === 0 ? (
                <p className="text-gray-500 text-sm">
                  No GEDCOM events yet. Click "Import GEDCOM" to upload a .ged file.
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
                        readOnly={true}
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
              onMapClick={() => {}}
              isAddingEvent={false}
              mapCenter={mapCenter}
              mapZoom={mapZoom}
              searchLocation={searchLocation}
              showOrigins={true}
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

      {/* Event Detail Modal (read-only) */}
      {showEventDetail && selectedEvent && (
        <EventDetail
          event={selectedEvent}
          onClose={() => setShowEventDetail(false)}
          onEventUpdated={fetchEvents}
          readOnly={true}
        />
      )}

      {/* GEDCOM Import Loading Overlay */}
      {importLoading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center" style={{ zIndex: 10001 }}>
          <div className="bg-white rounded-lg p-8 max-w-sm mx-4 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Importing GEDCOM</h3>
            <p className="text-gray-500 text-sm">Geocoding locations... this may take a minute.</p>
          </div>
        </div>
      )}

      {/* GEDCOM Import Result Dialog */}
      {importResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center" style={{ zIndex: 10001 }}>
          <div className="bg-white rounded-lg p-6 max-w-md mx-4 w-full">
            {importResult.error ? (
              <>
                <h3 className="text-lg font-semibold text-red-600 mb-2">Import Failed</h3>
                <p className="text-gray-700 mb-4">{importResult.error}</p>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-green-600 mb-2">Import Complete</h3>
                <div className="space-y-2 mb-4">
                  <p className="text-gray-700">
                    <span className="font-medium">{importResult.imported}</span> events imported,{' '}
                    <span className="font-medium">{importResult.skipped}</span> skipped (no location found)
                  </p>
                  {importResult.people?.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-gray-600 mb-1">
                        People ({importResult.people.length}):
                      </p>
                      <div className="max-h-48 overflow-auto text-sm text-gray-600 bg-gray-50 rounded p-2">
                        {importResult.people.map((name, i) => (
                          <div key={i}>{name}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
            <button
              onClick={() => setImportResult(null)}
              className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
