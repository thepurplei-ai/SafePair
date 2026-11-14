export type Location = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  battery: number | null;
  timestamp: number;
};

export type Sos = {
  active: true;
  startedAt: number;
  note: string | null;
  location: Location | null;
};

export type PublicUser = {
  id: string;
  name: string;
  lastLocation: Location | null;
  sos: Sos | null;
};

export type Me = PublicUser & { partnerId: string | null };
export type Partner = PublicUser & { online: boolean };

export type SessionPayload = { user: Me; partner: Partner | null };

export type Message = {
  id: string;
  clientId: string | null;
  from: string;
  to: string;
  kind: 'text' | 'location' | 'sos' | 'system';
  text: string;
  location: Location | null;
  createdAt: number;
};

export type Home = { latitude: number; longitude: number; label?: string };
