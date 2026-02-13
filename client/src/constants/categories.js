export const EVENT_CATEGORIES = [
  { value: 'birth', label: 'Birth', color: '#16a34a' },
  { value: 'death', label: 'Death', color: '#374151' },
  { value: 'marriage', label: 'Marriage', color: '#db2777' },
  { value: 'moved', label: 'Moved / Residence', color: '#2563eb' },
  { value: 'military', label: 'Military', color: '#65a30d' },
  { value: 'education', label: 'Education', color: '#7c3aed' },
  { value: 'work', label: 'Work / Career', color: '#ea580c' },
  { value: 'other', label: 'Other', color: '#6b7280' },
];

export function getCategoryColor(category) {
  const cat = EVENT_CATEGORIES.find(c => c.value === category);
  return cat ? cat.color : '#6b7280';
}

export function getCategoryLabel(category) {
  const cat = EVENT_CATEGORIES.find(c => c.value === category);
  return cat ? cat.label : 'Other';
}
