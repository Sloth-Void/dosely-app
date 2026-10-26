import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { getAllProfiles, getSetting, setSetting } from '../db/queries';
import type { ProfileRow } from '../db/types';

const ACTIVE_PROFILE_KEY = 'active_profile_id';

interface ProfileContextValue {
  activeProfile: ProfileRow | null;
  profiles: ProfileRow[];
  loading: boolean;
  setActiveProfile: (profile: ProfileRow) => Promise<void>;
  refreshProfiles: () => Promise<ProfileRow[]>;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [activeProfile, setActiveProfileState] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfiles = useCallback(async () => {
    const all = await getAllProfiles(db);
    setProfiles(all);
    return all;
  }, [db]);

  useEffect(() => {
    (async () => {
      const all = await refreshProfiles();
      const activeId = await getSetting(db, ACTIVE_PROFILE_KEY);
      const match = all.find((p) => p.id === Number(activeId));
      setActiveProfileState(match ?? all[0] ?? null);
      setLoading(false);
    })();
  }, [db, refreshProfiles]);

  async function setActiveProfile(profile: ProfileRow) {
    await setSetting(db, ACTIVE_PROFILE_KEY, String(profile.id));
    setActiveProfileState(profile);
  }

  return (
    <ProfileContext.Provider
      value={{ activeProfile, profiles, loading, setActiveProfile, refreshProfiles }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useActiveProfile(): ProfileContextValue {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error('useActiveProfile must be used within a ProfileProvider');
  }
  return context;
}
