import { useState, useEffect, useCallback } from 'react';
import { familyApi } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';

const RELATIONSHIP_OPTIONS = [
  { value: '', label: 'Set relationship...' },
  { value: 'parent', label: 'Parent' },
  { value: 'child', label: 'Child' },
  { value: 'spouse', label: 'Spouse' },
];

// Compute display label from relationship + member sex (if known)
function getDisplayLabel(relationship, memberName) {
  if (!relationship) return null;
  const labels = {
    parent: 'Parent',
    child: 'Child',
    spouse: 'Spouse',
  };
  return labels[relationship] || relationship;
}

export default function FamilyPanel({ onMemberSelect, selectedMemberId }) {
  const [members, setMembers] = useState([]);
  const [family, setFamily] = useState(null);
  const [requests, setRequests] = useState([]);
  const [relationships, setRelationships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [familyName, setFamilyName] = useState('');
  const [hostEmail, setHostEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const { user, refreshUser } = useAuth();

  const fetchFamily = useCallback(async () => {
    try {
      const response = await familyApi.getMembers();
      setMembers(response.data.members || []);
      setFamily(response.data.family || null);

      // If user is host, fetch pending requests
      if (response.data.family && response.data.family.host_user_id === user?.id) {
        const reqResponse = await familyApi.getRequests();
        setRequests(reqResponse.data.requests || []);
      }

      // Fetch relationships
      if (response.data.family) {
        const relResponse = await familyApi.getRelationships();
        setRelationships(relResponse.data.relationships || []);
      }
    } catch (err) {
      console.error('Failed to fetch family:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchFamily();
  }, [fetchFamily]);

  // Get the relationship label for a member relative to the current user
  const getRelationshipForMember = (memberId) => {
    // Find relationship where user_id is current user and related_user_id is this member
    const rel = relationships.find(
      r => r.user_id === user?.id && r.related_user_id === memberId
    );
    return rel ? rel.relationship : null;
  };

  const handleSetRelationship = async (memberId, relationship) => {
    if (!relationship) return;
    setError('');
    try {
      const response = await familyApi.setRelationship({
        userId: user.id,
        relatedUserId: memberId,
        relationship,
      });
      setRelationships(response.data.relationships || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to set relationship');
    }
  };

  const handleRemoveRelationship = async (memberId) => {
    setError('');
    // Find the relationship id
    const rel = relationships.find(
      r => r.user_id === user?.id && r.related_user_id === memberId
    );
    if (!rel) return;
    try {
      const response = await familyApi.deleteRelationship(rel.id);
      setRelationships(response.data.relationships || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to remove relationship');
    }
  };

  const handleCreateFamily = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await familyApi.createFamily({ name: familyName });
      setMessage('Family created!');
      setShowCreate(false);
      setFamilyName('');
      await refreshUser();
      fetchFamily();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create family');
    }
  };

  const handleJoinRequest = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      const response = await familyApi.requestJoin({ email: hostEmail });
      setMessage(response.data.message);
      setShowJoin(false);
      setHostEmail('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send request');
    }
  };

  const handleApprove = async (requestId) => {
    try {
      await familyApi.approveRequest(requestId);
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
      fetchFamily();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to approve');
    }
  };

  const handleDeny = async (requestId) => {
    try {
      await familyApi.denyRequest(requestId);
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to deny');
    }
  };

  if (loading) {
    return (
      <div className="p-4">
        <p className="text-gray-500 text-sm">Loading family...</p>
      </div>
    );
  }

  // User has no family yet - show create/join options
  if (!family) {
    return (
      <div className="p-4">
        <h3 className="font-semibold text-gray-800 mb-3">Family</h3>

        {message && (
          <div className="bg-green-100 text-green-700 px-3 py-2 rounded text-sm mb-3">{message}</div>
        )}
        {error && (
          <div className="bg-red-100 text-red-700 px-3 py-2 rounded text-sm mb-3">{error}</div>
        )}

        <p className="text-gray-500 text-sm mb-4">
          Create a family or join an existing one to share events.
        </p>

        {!showCreate && !showJoin && (
          <div className="space-y-2">
            <button
              onClick={() => { setShowCreate(true); setShowJoin(false); setError(''); setMessage(''); }}
              className="w-full px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
            >
              Create a Family
            </button>
            <button
              onClick={() => { setShowJoin(true); setShowCreate(false); setError(''); setMessage(''); }}
              className="w-full px-3 py-2 bg-purple-600 text-white rounded text-sm hover:bg-purple-700"
            >
              Join a Family
            </button>
          </div>
        )}

        {showCreate && (
          <form onSubmit={handleCreateFamily} className="space-y-2">
            <input
              type="text"
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              placeholder="Family name (e.g., The Smiths)"
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500"
              required
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-3 py-2 text-gray-600 text-sm hover:text-gray-800"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {showJoin && (
          <form onSubmit={handleJoinRequest} className="space-y-2">
            <input
              type="email"
              value={hostEmail}
              onChange={(e) => setHostEmail(e.target.value)}
              placeholder="Family host's email"
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500"
              required
            />
            <p className="text-xs text-gray-500">
              Enter the email of the person who created the family. They will get a notification to approve your request.
            </p>
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 px-3 py-2 bg-purple-600 text-white rounded text-sm hover:bg-purple-700"
              >
                Send Request
              </button>
              <button
                type="button"
                onClick={() => setShowJoin(false)}
                className="px-3 py-2 text-gray-600 text-sm hover:text-gray-800"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    );
  }

  const isHost = family.host_user_id === user?.id;

  // User has a family
  return (
    <div className="p-4">
      <h3 className="font-semibold text-gray-800 mb-1">
        {family.name}
      </h3>
      <p className="text-xs text-gray-500 mb-3">
        {isHost ? 'You are the host' : 'Member'}
      </p>

      {error && (
        <div className="bg-red-100 text-red-700 px-3 py-2 rounded text-sm mb-3">{error}</div>
      )}

      {/* Pending requests (host only) */}
      {requests.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-orange-700 mb-2">
            Pending Requests ({requests.length})
          </h4>
          <div className="space-y-2">
            {requests.map((req) => (
              <div key={req.id} className="bg-orange-50 border border-orange-200 rounded p-2">
                <p className="text-sm font-medium">{req.requester_name}</p>
                <p className="text-xs text-gray-500">{req.requester_email}</p>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => handleApprove(req.id)}
                    className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleDeny(req.id)}
                    className="px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
                  >
                    Deny
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Members list */}
      <h4 className="text-sm font-semibold text-gray-700 mb-2">Members</h4>
      <ul className="space-y-1">
        {members.map((member) => {
          const rel = getRelationshipForMember(member.id);
          const label = getDisplayLabel(rel);
          return (
            <li key={member.id}>
              <button
                onClick={() => onMemberSelect(member.id === user?.id ? null : member.id)}
                className={`w-full text-left px-3 py-2 rounded transition-colors ${
                  selectedMemberId === member.id
                    ? 'bg-purple-100 text-purple-800'
                    : member.id === user?.id
                    ? 'bg-blue-50 text-blue-800'
                    : 'hover:bg-gray-100'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold ${
                      member.id === user?.id ? 'bg-blue-600' : 'bg-purple-600'
                    }`}
                  >
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm">
                      {member.name}
                      {member.id === user?.id && ' (You)'}
                    </span>
                    {label && member.id !== user?.id && (
                      <span className="ml-2 text-xs text-gray-500 italic">{label}</span>
                    )}
                  </div>
                </div>
              </button>

              {/* Relationship controls (host only, for other members) */}
              {isHost && member.id !== user?.id && (
                <div className="ml-12 mt-1 mb-2 flex items-center gap-1">
                  <select
                    value={rel || ''}
                    onChange={(e) => {
                      if (e.target.value) {
                        handleSetRelationship(member.id, e.target.value);
                      }
                    }}
                    className="text-xs border border-gray-200 rounded px-1 py-0.5 bg-white text-gray-600"
                  >
                    {RELATIONSHIP_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  {rel && (
                    <button
                      onClick={() => handleRemoveRelationship(member.id)}
                      className="text-xs text-red-400 hover:text-red-600"
                      title="Remove relationship"
                    >
                      x
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
