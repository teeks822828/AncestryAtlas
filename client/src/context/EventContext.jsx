import { createContext, useContext, useState, useCallback } from 'react';
import { eventsApi, familyApi } from '../hooks/useApi';

const EventContext = createContext(null);

export function EventProvider({ children, source }) {
  const [events, setEvents] = useState([]);
  const [familyEvents, setFamilyEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [viewingMember, setViewingMember] = useState(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const response = await eventsApi.getAll(source);
      setEvents(response.data.events);
    } catch (error) {
      console.error('Failed to fetch events:', error);
    } finally {
      setLoading(false);
    }
  }, [source]);

  const fetchFamilyEvents = useCallback(async () => {
    try {
      const response = await familyApi.getAllFamilyEvents(source);
      setFamilyEvents(response.data.events);
    } catch (error) {
      console.error('Failed to fetch family events:', error);
    }
  }, [source]);

  const fetchMemberEvents = useCallback(async (memberId) => {
    setLoading(true);
    try {
      const response = await familyApi.getMemberEvents(memberId, source);
      setViewingMember(response.data.member);
      return response.data.events;
    } catch (error) {
      console.error('Failed to fetch member events:', error);
      return [];
    } finally {
      setLoading(false);
    }
  }, [source]);

  const createEvent = useCallback(async (eventData) => {
    try {
      const response = await eventsApi.create(eventData);
      setEvents((prev) => [...prev, response.data.event].sort(
        (a, b) => new Date(a.event_date) - new Date(b.event_date)
      ));
      return response.data.event;
    } catch (error) {
      console.error('Failed to create event:', error);
      throw error;
    }
  }, []);

  const updateEvent = useCallback(async (id, eventData) => {
    try {
      const response = await eventsApi.update(id, eventData);
      setEvents((prev) =>
        prev.map((e) => (e.id === id ? response.data.event : e)).sort(
          (a, b) => new Date(a.event_date) - new Date(b.event_date)
        )
      );
      return response.data.event;
    } catch (error) {
      console.error('Failed to update event:', error);
      throw error;
    }
  }, []);

  const deleteEvent = useCallback(async (id) => {
    try {
      await eventsApi.delete(id);
      setEvents((prev) => prev.filter((e) => e.id !== id));
      if (selectedEvent?.id === id) {
        setSelectedEvent(null);
      }
    } catch (error) {
      console.error('Failed to delete event:', error);
      throw error;
    }
  }, [selectedEvent]);

  const clearViewingMember = useCallback(() => {
    setViewingMember(null);
  }, []);

  return (
    <EventContext.Provider
      value={{
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
      }}
    >
      {children}
    </EventContext.Provider>
  );
}

export function useEvents() {
  const context = useContext(EventContext);
  if (!context) {
    throw new Error('useEvents must be used within an EventProvider');
  }
  return context;
}
