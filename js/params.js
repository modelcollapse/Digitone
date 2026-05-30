// Digitone MIDI CC parameter definitions
// All CC values sourced from Elektron Digitone MIDI Implementation

export const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

export function midiNoteToName(n) {
  return NOTE_NAMES[n % 12] + (Math.floor(n / 12) - 1);
}

export function noteNameToMidi(name) {
  const m = name.match(/^([A-G]#?)(-?\d+)$/);
  if (!m) return 60;
  return (parseInt(m[2]) + 1) * 12 + NOTE_NAMES.indexOf(m[1]);
}

export const TRACK_COLORS = ['#e07020','#2090e0','#e02060','#20c080'];

// Per-track parameters (MIDI ch 1-4)
export const TRACK_PARAMS = {
  syn1: {
    label: 'SYN 1',
    params: [
      { id: 'algo',  name: 'Algorithm', cc: 90,            min: 0, max: 7,   def: 0  },
      { id: 'ratc',  name: 'Ratio C',   cc: 91,            min: 0, max: 127, def: 64 },
      { id: 'rata',  name: 'Ratio A',   cc: 92,            min: 0, max: 127, def: 64 },
      { id: 'ratb',  name: 'Ratio B',   cc: 16, lsb: 48,  min: 0, max: 127, def: 64 },
      { id: 'harm',  name: 'Harmonics', cc: 17, lsb: 49,  min: 0, max: 127, def: 0  },
      { id: 'detu',  name: 'Detune',    cc: 18, lsb: 50,  min: 0, max: 127, def: 64 },
      { id: 'fdbk',  name: 'Feedback',  cc: 19, lsb: 51,  min: 0, max: 127, def: 0  },
      { id: 'mix',   name: 'Mix',       cc: 20,            min: 0, max: 127, def: 64 },
    ]
  },
  syn2: {
    label: 'SYN 2',
    params: [
      { id: 'aatk',  name: 'A Attack',  cc: 75, min: 0, max: 127, def: 0   },
      { id: 'adec',  name: 'A Decay',   cc: 76, min: 0, max: 127, def: 64  },
      { id: 'aend',  name: 'A End',     cc: 77, min: 0, max: 127, def: 0   },
      { id: 'alvl',  name: 'A Level',   cc: 78, min: 0, max: 127, def: 100 },
      { id: 'batk',  name: 'B Attack',  cc: 79, min: 0, max: 127, def: 0   },
      { id: 'bdec',  name: 'B Decay',   cc: 80, min: 0, max: 127, def: 64  },
      { id: 'bend',  name: 'B End',     cc: 81, min: 0, max: 127, def: 0   },
      { id: 'blvl',  name: 'B Level',   cc: 82, min: 0, max: 127, def: 100 },
      { id: 'adly',  name: 'A Delay',   cc: 83, min: 0, max: 127, def: 0   },
      { id: 'bdly',  name: 'B Delay',   cc: 86, min: 0, max: 127, def: 0   },
      { id: 'phrst', name: 'Phs Reset', cc: 89, min: 0, max: 127, def: 0   },
    ]
  },
  filter: {
    label: 'FILTER',
    params: [
      { id: 'freq',  name: 'Freq',      cc: 23, lsb: 55, min: 0, max: 127, def: 127 },
      { id: 'reso',  name: 'Reso',      cc: 24, lsb: 56, min: 0, max: 127, def: 0   },
      { id: 'ftyp',  name: 'Type',      cc: 74,           min: 0, max: 4,   def: 0   },
      { id: 'fatk',  name: 'Atk',       cc: 70,           min: 0, max: 127, def: 0   },
      { id: 'fdec',  name: 'Dec',       cc: 71,           min: 0, max: 127, def: 64  },
      { id: 'fsus',  name: 'Sus',       cc: 72,           min: 0, max: 127, def: 64  },
      { id: 'frel',  name: 'Rel',       cc: 73,           min: 0, max: 127, def: 64  },
      { id: 'fdep',  name: 'Depth',     cc: 25, lsb: 57, min: 0, max: 127, def: 64  },
      { id: 'base',  name: 'Base',      cc: 26, lsb: 58, min: 0, max: 127, def: 64  },
      { id: 'wid',   name: 'Width',     cc: 27, lsb: 59, min: 0, max: 127, def: 64  },
    ]
  },
  amp: {
    label: 'AMP',
    params: [
      { id: 'aatk2', name: 'Attack',    cc: 104,           min: 0, max: 127, def: 0   },
      { id: 'adec2', name: 'Decay',     cc: 105,           min: 0, max: 127, def: 64  },
      { id: 'asus',  name: 'Sustain',   cc: 106,           min: 0, max: 127, def: 100 },
      { id: 'arel',  name: 'Release',   cc: 107,           min: 0, max: 127, def: 32  },
      { id: 'drive', name: 'Drive',     cc: 9,  lsb: 41,  min: 0, max: 127, def: 0   },
      { id: 'pan',   name: 'Pan',       cc: 10, lsb: 42,  min: 0, max: 127, def: 64  },
      { id: 'vol',   name: 'Volume',    cc: 7,  lsb: 39,  min: 0, max: 127, def: 100 },
      { id: 'cho',   name: 'Chorus',    cc: 12, lsb: 44,  min: 0, max: 127, def: 0   },
      { id: 'dly',   name: 'Delay',     cc: 13, lsb: 45,  min: 0, max: 127, def: 0   },
      { id: 'rvb',   name: 'Reverb',    cc: 14, lsb: 46,  min: 0, max: 127, def: 0   },
    ]
  },
  lfo: {
    label: 'LFO',
    params: [
      { id: 'l1spd', name: 'L1 Speed',  cc: 28, lsb: 60, min: 0, max: 127, def: 64 },
      { id: 'l1mul', name: 'L1 Mult',   cc: 108,          min: 0, max: 11,  def: 0  },
      { id: 'l1fde', name: 'L1 Fade',   cc: 109,          min: 0, max: 127, def: 64 },
      { id: 'l1dst', name: 'L1 Dest',   cc: 110,          min: 0, max: 127, def: 0  },
      { id: 'l1wav', name: 'L1 Wave',   cc: 111,          min: 0, max: 5,   def: 0  },
      { id: 'l1phs', name: 'L1 Phase',  cc: 112,          min: 0, max: 127, def: 0  },
      { id: 'l1dep', name: 'L1 Depth',  cc: 29, lsb: 61, min: 0, max: 127, def: 0  },
      { id: 'l2spd', name: 'L2 Speed',  cc: 30, lsb: 62, min: 0, max: 127, def: 64 },
      { id: 'l2mul', name: 'L2 Mult',   cc: 114,          min: 0, max: 11,  def: 0  },
      { id: 'l2fde', name: 'L2 Fade',   cc: 115,          min: 0, max: 127, def: 64 },
      { id: 'l2dst', name: 'L2 Dest',   cc: 116,          min: 0, max: 127, def: 0  },
      { id: 'l2wav', name: 'L2 Wave',   cc: 117,          min: 0, max: 5,   def: 0  },
      { id: 'l2phs', name: 'L2 Phase',  cc: 118,          min: 0, max: 127, def: 0  },
      { id: 'l2dep', name: 'L2 Depth',  cc: 31, lsb: 63, min: 0, max: 127, def: 0  },
    ]
  },
  trig: {
    label: 'TRIG',
    params: [
      { id: 'len',   name: 'Length',    cc: 5,  min: 0, max: 127, def: 64 },
      { id: 'port',  name: 'Portamento',cc: 15, min: 0, max: 127, def: 0  },
    ]
  },
  track: {
    label: 'TRACK',
    params: [
      { id: 'tlvl',  name: 'Level',     cc: 95, min: 0, max: 127, def: 100 },
      { id: 'mute',  name: 'Mute',      cc: 94, min: 0, max: 1,   def: 0   },
    ]
  }
};

// FX parameters (FX MIDI channel, default 9)
export const FX_PARAMS = {
  chorus: {
    label: 'CHORUS',
    params: [
      { id: 'cdep', name: 'Depth',    cc: 3,  lsb: 35, min: 0, max: 127, def: 0   },
      { id: 'cspd', name: 'Speed',    cc: 9,  lsb: 41, min: 0, max: 127, def: 64  },
      { id: 'chp',  name: 'Hi-pass',  cc: 70,           min: 0, max: 127, def: 0   },
      { id: 'cwid', name: 'Width',    cc: 71,           min: 0, max: 127, def: 64  },
      { id: 'cds',  name: 'Dly Send', cc: 12, lsb: 44, min: 0, max: 127, def: 0   },
      { id: 'crs',  name: 'Rvb Send', cc: 13, lsb: 45, min: 0, max: 127, def: 0   },
      { id: 'cmix', name: 'Mix Vol',  cc: 14,           min: 0, max: 127, def: 100 },
    ]
  },
  delay: {
    label: 'DELAY',
    params: [
      { id: 'dtim', name: 'Time',     cc: 15, lsb: 47, min: 0, max: 127, def: 64  },
      { id: 'dpp',  name: 'Pingpong', cc: 16, lsb: 48, min: 0, max: 127, def: 0   },
      { id: 'dsw',  name: 'Width',    cc: 17, lsb: 49, min: 0, max: 127, def: 64  },
      { id: 'dfb',  name: 'Feedback', cc: 18, lsb: 50, min: 0, max: 127, def: 64  },
      { id: 'dhp',  name: 'HP Filt',  cc: 72,           min: 0, max: 127, def: 0   },
      { id: 'dlp',  name: 'LP Filt',  cc: 73,           min: 0, max: 127, def: 127 },
      { id: 'drs',  name: 'Rvb Send', cc: 19, lsb: 51, min: 0, max: 127, def: 0   },
      { id: 'dmix', name: 'Mix Vol',  cc: 20,           min: 0, max: 127, def: 100 },
    ]
  },
  reverb: {
    label: 'REVERB',
    params: [
      { id: 'rpre', name: 'Predelay', cc: 21, lsb: 53, min: 0, max: 127, def: 0   },
      { id: 'rdec', name: 'Decay',    cc: 74,           min: 0, max: 127, def: 64  },
      { id: 'rshf', name: 'Shelf Frq',cc: 75,           min: 0, max: 127, def: 64  },
      { id: 'rshg', name: 'Shelf Gn', cc: 22, lsb: 54, min: 0, max: 127, def: 64  },
      { id: 'rhp',  name: 'HP Filt',  cc: 76,           min: 0, max: 127, def: 0   },
      { id: 'rlp',  name: 'LP Filt',  cc: 77,           min: 0, max: 127, def: 127 },
      { id: 'rmix', name: 'Mix Vol',  cc: 23,           min: 0, max: 127, def: 100 },
    ]
  },
  master: {
    label: 'MASTER',
    params: [
      { id: 'minl', name: 'In L Vol', cc: 24, lsb: 56, min: 0, max: 127, def: 100 },
      { id: 'minr', name: 'In R Vol', cc: 25, lsb: 57, min: 0, max: 127, def: 100 },
      { id: 'mpnl', name: 'Pan L',    cc: 78,           min: 0, max: 127, def: 0   },
      { id: 'mpnr', name: 'Pan R',    cc: 79,           min: 0, max: 127, def: 127 },
      { id: 'mcho', name: 'Chorus',   cc: 26, lsb: 58, min: 0, max: 127, def: 0   },
      { id: 'mdly', name: 'Delay',    cc: 27, lsb: 59, min: 0, max: 127, def: 0   },
      { id: 'mrvb', name: 'Reverb',   cc: 28, lsb: 60, min: 0, max: 127, def: 0   },
      { id: 'movd', name: 'Overdrive',cc: 29, lsb: 61, min: 0, max: 127, def: 0   },
      { id: 'mpvl', name: 'Pat Vol',  cc: 95,           min: 0, max: 127, def: 100 },
    ]
  }
};

export function getAllTrackParams() {
  return Object.entries(TRACK_PARAMS).flatMap(([key, group]) =>
    group.params.map(p => ({ ...p, group: key, groupLabel: group.label }))
  );
}
