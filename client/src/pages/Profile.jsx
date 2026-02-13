import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { profileApi, familyApi } from '../hooks/useApi';

export default function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [family, setFamily] = useState(null);
  const [loading, setLoading] = useState(true);

  // Name editing
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [nameMsg, setNameMsg] = useState('');

  // Password changing
  const [showPassword, setShowPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState('');
  const [passwordError, setPasswordError] = useState('');

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const res = await profileApi.get();
      setProfile(res.data.user);
      setFamily(res.data.family);
      setNewName(res.data.user.name);
    } catch (err) {
      console.error('Failed to load profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleNameSave = async () => {
    setNameMsg('');
    try {
      const res = await profileApi.updateName(newName);
      setProfile(res.data.user);
      setEditingName(false);
      setNameMsg('Name updated!');
      setTimeout(() => setNameMsg(''), 3000);
    } catch (err) {
      setNameMsg(err.response?.data?.error || 'Failed to update name');
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPasswordMsg('');
    setPasswordError('');

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    try {
      await profileApi.changePassword(currentPassword, newPassword);
      setPasswordMsg('Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowPassword(false);
      setTimeout(() => setPasswordMsg(''), 3000);
    } catch (err) {
      setPasswordError(err.response?.data?.error || 'Failed to change password');
    }
  };

  const handleLeaveFamily = async () => {
    if (!confirm('Are you sure you want to leave this family?')) return;
    try {
      await familyApi.leaveFamily();
      setFamily(null);
      loadProfile();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to leave family');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-blue-600">Your Profile</h1>
          <div className="flex items-center gap-4">
            <Link to="/dashboard" className="text-blue-600 hover:underline text-sm">
              Back to Dashboard
            </Link>
            <button onClick={logout} className="text-gray-500 hover:text-gray-700 text-sm">
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Account Info */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Account Information</h2>

          {nameMsg && (
            <div className="bg-green-100 text-green-700 px-3 py-2 rounded text-sm mb-4">{nameMsg}</div>
          )}

          {/* Email */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-500 mb-1">Email</label>
            <p className="text-gray-800">{profile?.email}</p>
          </div>

          {/* Name */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-500 mb-1">Name</label>
            {editingName ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={handleNameSave}
                  className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                >
                  Save
                </button>
                <button
                  onClick={() => { setEditingName(false); setNewName(profile?.name); }}
                  className="px-4 py-2 text-gray-600 text-sm hover:text-gray-800"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <p className="text-gray-800">{profile?.name}</p>
                <button
                  onClick={() => setEditingName(true)}
                  className="text-sm text-blue-600 hover:underline"
                >
                  Edit
                </button>
              </div>
            )}
          </div>

          {/* Member since */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-500 mb-1">Member Since</label>
            <p className="text-gray-800">
              {profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-US', {
                year: 'numeric', month: 'long', day: 'numeric'
              }) : 'N/A'}
            </p>
          </div>
        </div>

        {/* Password */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Password</h2>

          {passwordMsg && (
            <div className="bg-green-100 text-green-700 px-3 py-2 rounded text-sm mb-4">{passwordMsg}</div>
          )}
          {passwordError && (
            <div className="bg-red-100 text-red-700 px-3 py-2 rounded text-sm mb-4">{passwordError}</div>
          )}

          {showPassword ? (
            <form onSubmit={handlePasswordChange} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                  minLength={6}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`w-full px-3 py-2 border rounded focus:outline-none focus:border-blue-500 ${
                    confirmPassword && confirmPassword !== newPassword
                      ? 'border-red-400'
                      : 'border-gray-300'
                  }`}
                  minLength={6}
                  required
                />
                {confirmPassword && confirmPassword !== newPassword && (
                  <p className="text-red-500 text-xs mt-1">Passwords do not match</p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={!newPassword || !confirmPassword || newPassword !== confirmPassword}
                  className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Change Password
                </button>
                <button
                  type="button"
                  onClick={() => { setShowPassword(false); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setPasswordError(''); }}
                  className="px-4 py-2 text-gray-600 text-sm hover:text-gray-800"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setShowPassword(true)}
              className="text-sm text-blue-600 hover:underline"
            >
              Change Password
            </button>
          )}
        </div>

        {/* Family */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Family</h2>

          {family ? (
            <div>
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-500 mb-1">Family Name</label>
                <p className="text-gray-800">{family.name}</p>
              </div>
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-500 mb-1">Role</label>
                <p className="text-gray-800">
                  {(family.host_user_id === profile?.id || family.host_user_id === user?.id) ? 'Host' : 'Member'}
                </p>
              </div>
              {(family.host_user_id !== profile?.id && family.host_user_id !== user?.id) && (
                <button
                  onClick={handleLeaveFamily}
                  className="text-sm text-red-600 hover:text-red-800"
                >
                  Leave Family
                </button>
              )}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">
              You're not part of a family. Go to the{' '}
              <Link to="/dashboard" className="text-blue-600 hover:underline">dashboard</Link>
              {' '}to create or join one.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
