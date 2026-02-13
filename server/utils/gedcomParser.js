/**
 * GEDCOM file parser for Ancestry Atlas
 * Extracts individuals with birth/death/burial events from .ged files
 */

const MONTHS = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  january: '01', february: '02', march: '03', april: '04',
  june: '06', july: '07', august: '08', september: '09',
  october: '10', november: '11', december: '12'
};

/**
 * Parse a GEDCOM date string into ISO format (YYYY-MM-DD or YYYY-MM or YYYY)
 * Handles: "12 Oct 1982", "01-Feb-1837", "May 12, 1805", "abt 1884",
 *          "1567", "Abt. 1756", "ABT 1722", "Jan 1900", "Mar 1739",
 *          "5 JUN 1835", "after 1698", "Unknown", etc.
 */
function parseDate(dateStr) {
  if (!dateStr) return null;

  const cleaned = dateStr
    .replace(/^(abt\.?|about|circa|bef\.?|before|aft\.?|after|est\.?|cal\.?)\s*/i, '')
    .trim();

  if (!cleaned || /^unknown$/i.test(cleaned)) return null;

  // Just a year: "1567"
  if (/^\d{4}$/.test(cleaned)) {
    return cleaned + '-01-01';
  }

  // "DD-Mon-YYYY" format: "01-Feb-1837", "31-Oct-1849"
  const dashMatch = cleaned.match(/^(\d{1,2})-(\w+)-(\d{4})$/);
  if (dashMatch) {
    const month = MONTHS[dashMatch[2].toLowerCase()];
    if (month) {
      return `${dashMatch[3]}-${month}-${dashMatch[1].padStart(2, '0')}`;
    }
  }

  // "DD Mon YYYY" or "D Mon YYYY": "12 Oct 1982", "5 JUN 1835"
  const dmy = cleaned.match(/^(\d{1,2})\s+(\w+)\s+(\d{4})$/);
  if (dmy) {
    const month = MONTHS[dmy[2].toLowerCase()];
    if (month) {
      return `${dmy[3]}-${month}-${dmy[1].padStart(2, '0')}`;
    }
  }

  // "Mon DD, YYYY": "May 12, 1805"
  const mdy = cleaned.match(/^(\w+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (mdy) {
    const month = MONTHS[mdy[1].toLowerCase()];
    if (month) {
      return `${mdy[3]}-${month}-${mdy[2].padStart(2, '0')}`;
    }
  }

  // "Mon YYYY" or "Month YYYY": "Jan 1900", "October 1857"
  const my = cleaned.match(/^(\w+)\s+(\d{4})$/);
  if (my) {
    const month = MONTHS[my[1].toLowerCase()];
    if (month) {
      return `${my[2]}-${month}-01`;
    }
  }

  // "DD Month YYYY" with full month name: "28 August 1817"
  // Already handled by dmy pattern above

  return null;
}

/**
 * Parse a GEDCOM file and extract individuals with their events
 * @param {string} content - Raw GEDCOM file content
 * @returns {Array} Array of person objects with events
 */
function parseGedcom(content) {
  const lines = content.split(/\r?\n/);
  const individuals = [];
  let currentIndi = null;
  let currentEvent = null;
  let currentLevel = 0;

  for (const line of lines) {
    const match = line.match(/^(\d+)\s+(.+)$/);
    if (!match) continue;

    const level = parseInt(match[1]);
    const rest = match[2];

    // Level 0: new record
    if (level === 0) {
      if (currentIndi) {
        individuals.push(currentIndi);
      }
      currentIndi = null;
      currentEvent = null;

      const indiMatch = rest.match(/^@\w+@\s+INDI$/);
      if (indiMatch) {
        currentIndi = {
          givn: '',
          surn: '',
          birth: { date: null, place: null },
          death: { date: null, place: null },
          burial: { place: null }
        };
      }
      continue;
    }

    if (!currentIndi) continue;

    // Level 1: main tags under INDI
    if (level === 1) {
      currentEvent = null;

      if (rest === 'BIRT') {
        currentEvent = 'birth';
      } else if (rest === 'DEAT') {
        currentEvent = 'death';
      } else if (rest === 'BURI') {
        currentEvent = 'burial';
      } else {
        // Name parts at level 2 follow a NAME tag at level 1
        const nameMatch = rest.match(/^NAME\s+(.*)$/);
        if (nameMatch) {
          // NAME line itself - we use GIVN/SURN below for better parsing
          currentEvent = 'name';
        }
      }
      continue;
    }

    // Level 2: sub-tags
    if (level === 2) {
      if (currentEvent === 'name') {
        const givnMatch = rest.match(/^GIVN\s+(.+)$/);
        if (givnMatch) {
          currentIndi.givn = givnMatch[1].trim();
        }
        const surnMatch = rest.match(/^SURN\s+(.+)$/);
        if (surnMatch) {
          // Clean parenthetical surnames like "(Martha)"
          currentIndi.surn = surnMatch[1].replace(/[()]/g, '').trim();
        }
      } else if (currentEvent === 'birth' || currentEvent === 'death') {
        const dateMatch = rest.match(/^DATE\s+(.+)$/);
        if (dateMatch) {
          currentIndi[currentEvent].date = dateMatch[1].trim();
        }
        const placeMatch = rest.match(/^PLAC\s+(.+)$/);
        if (placeMatch) {
          currentIndi[currentEvent].place = placeMatch[1].trim();
        }
      } else if (currentEvent === 'burial') {
        const placeMatch = rest.match(/^PLAC\s+(.+)$/);
        if (placeMatch) {
          currentIndi.burial.place = placeMatch[1].trim();
        }
      }
    }
  }

  // Don't forget the last individual
  if (currentIndi) {
    individuals.push(currentIndi);
  }

  // Build events from individuals
  const results = [];
  for (const indi of individuals) {
    const name = [indi.givn, indi.surn].filter(Boolean).join(' ').trim();
    if (!name) continue;

    // Capitalize name properly
    const displayName = name.split(' ').map(w =>
      w.charAt(0).toUpperCase() + w.slice(1)
    ).join(' ');

    // Birth event
    const birthDate = parseDate(indi.birth.date);
    if (birthDate && indi.birth.place && indi.birth.place !== '?') {
      results.push({
        name: displayName,
        type: 'birth',
        title: `${displayName} - Birth`,
        description: `Born: ${indi.birth.date}`,
        date: birthDate,
        rawDate: indi.birth.date,
        place: indi.birth.place,
        category: 'birth'
      });
    }

    // Death event
    const deathDate = parseDate(indi.death.date);
    if (deathDate && indi.death.place && indi.death.place !== '?') {
      results.push({
        name: displayName,
        type: 'death',
        title: `${displayName} - Death`,
        description: `Died: ${indi.death.date}`,
        date: deathDate,
        rawDate: indi.death.date,
        place: indi.death.place,
        category: 'death'
      });
    }

    // Burial event (use death date if available)
    if (indi.burial.place && indi.burial.place !== '?') {
      const burialDate = deathDate || birthDate;
      if (burialDate) {
        results.push({
          name: displayName,
          type: 'burial',
          title: `${displayName} - Burial`,
          description: `Burial place${indi.death.date ? ` (died: ${indi.death.date})` : ''}`,
          date: burialDate,
          rawDate: indi.death.date || indi.birth.date,
          place: indi.burial.place,
          category: 'death'
        });
      }
    }
  }

  return results;
}

/**
 * Full GEDCOM parser — extracts individuals (with gedcom IDs), FAM records, and events
 * @param {string} content - Raw GEDCOM file content
 * @returns {{ events: Array, people: Array, families: Array }}
 */
function parseGedcomFull(content) {
  const lines = content.split(/\r?\n/);
  const individuals = [];
  const famRecords = [];
  let currentIndi = null;
  let currentFam = null;
  let currentEvent = null;

  for (const line of lines) {
    const match = line.match(/^(\d+)\s+(.+)$/);
    if (!match) continue;

    const level = parseInt(match[1]);
    const rest = match[2];

    // Level 0: new record
    if (level === 0) {
      // Save previous record
      if (currentIndi) individuals.push(currentIndi);
      if (currentFam) famRecords.push(currentFam);
      currentIndi = null;
      currentFam = null;
      currentEvent = null;

      // INDI record
      const indiMatch = rest.match(/^(@\S+@)\s+INDI$/);
      if (indiMatch) {
        currentIndi = {
          gedcomId: indiMatch[1],
          givn: '',
          surn: '',
          sex: null,
          birth: { date: null, place: null },
          death: { date: null, place: null },
          burial: { place: null }
        };
      }

      // FAM record
      const famMatch = rest.match(/^(@\S+@)\s+FAM$/);
      if (famMatch) {
        currentFam = {
          gedcomFamId: famMatch[1],
          husbandId: null,
          wifeId: null,
          childIds: []
        };
      }
      continue;
    }

    // Processing INDI sub-tags
    if (currentIndi) {
      if (level === 1) {
        currentEvent = null;

        if (rest === 'BIRT') {
          currentEvent = 'birth';
        } else if (rest === 'DEAT') {
          currentEvent = 'death';
        } else if (rest === 'BURI') {
          currentEvent = 'burial';
        } else {
          const nameMatch = rest.match(/^NAME\s+(.*)$/);
          if (nameMatch) {
            currentEvent = 'name';
          }
          const sexMatch = rest.match(/^SEX\s+(\S)$/);
          if (sexMatch) {
            currentIndi.sex = sexMatch[1].toUpperCase();
          }
        }
      } else if (level === 2) {
        if (currentEvent === 'name') {
          const givnMatch = rest.match(/^GIVN\s+(.+)$/);
          if (givnMatch) currentIndi.givn = givnMatch[1].trim();
          const surnMatch = rest.match(/^SURN\s+(.+)$/);
          if (surnMatch) currentIndi.surn = surnMatch[1].replace(/[()]/g, '').trim();
        } else if (currentEvent === 'birth' || currentEvent === 'death') {
          const dateMatch = rest.match(/^DATE\s+(.+)$/);
          if (dateMatch) currentIndi[currentEvent].date = dateMatch[1].trim();
          const placeMatch = rest.match(/^PLAC\s+(.+)$/);
          if (placeMatch) currentIndi[currentEvent].place = placeMatch[1].trim();
        } else if (currentEvent === 'burial') {
          const placeMatch = rest.match(/^PLAC\s+(.+)$/);
          if (placeMatch) currentIndi.burial.place = placeMatch[1].trim();
        }
      }
    }

    // Processing FAM sub-tags
    if (currentFam && level === 1) {
      const husbMatch = rest.match(/^HUSB\s+(@\S+@)$/);
      if (husbMatch) currentFam.husbandId = husbMatch[1];
      const wifeMatch = rest.match(/^WIFE\s+(@\S+@)$/);
      if (wifeMatch) currentFam.wifeId = wifeMatch[1];
      const chilMatch = rest.match(/^CHIL\s+(@\S+@)$/);
      if (chilMatch) currentFam.childIds.push(chilMatch[1]);
    }
  }

  // Don't forget last records
  if (currentIndi) individuals.push(currentIndi);
  if (currentFam) famRecords.push(currentFam);

  // Build events (same logic as parseGedcom)
  const events = [];
  for (const indi of individuals) {
    const name = [indi.givn, indi.surn].filter(Boolean).join(' ').trim();
    if (!name) continue;

    const displayName = name.split(' ').map(w =>
      w.charAt(0).toUpperCase() + w.slice(1)
    ).join(' ');

    const birthDate = parseDate(indi.birth.date);
    if (birthDate && indi.birth.place && indi.birth.place !== '?') {
      events.push({
        name: displayName, type: 'birth',
        title: `${displayName} - Birth`,
        description: `Born: ${indi.birth.date}`,
        date: birthDate, rawDate: indi.birth.date,
        place: indi.birth.place, category: 'birth'
      });
    }

    const deathDate = parseDate(indi.death.date);
    if (deathDate && indi.death.place && indi.death.place !== '?') {
      events.push({
        name: displayName, type: 'death',
        title: `${displayName} - Death`,
        description: `Died: ${indi.death.date}`,
        date: deathDate, rawDate: indi.death.date,
        place: indi.death.place, category: 'death'
      });
    }

    if (indi.burial.place && indi.burial.place !== '?') {
      const burialDate = deathDate || birthDate;
      if (burialDate) {
        events.push({
          name: displayName, type: 'burial',
          title: `${displayName} - Burial`,
          description: `Burial place${indi.death.date ? ` (died: ${indi.death.date})` : ''}`,
          date: burialDate, rawDate: indi.death.date || indi.birth.date,
          place: indi.burial.place, category: 'death'
        });
      }
    }
  }

  // Build people array
  const people = individuals
    .filter(indi => {
      const name = [indi.givn, indi.surn].filter(Boolean).join(' ').trim();
      return name.length > 0;
    })
    .map(indi => {
      const name = [indi.givn, indi.surn].filter(Boolean).join(' ').trim();
      const displayName = name.split(' ').map(w =>
        w.charAt(0).toUpperCase() + w.slice(1)
      ).join(' ');
      return {
        gedcomId: indi.gedcomId,
        name: displayName,
        sex: indi.sex,
        birthDate: parseDate(indi.birth.date),
        birthPlace: indi.birth.place || null,
        deathDate: parseDate(indi.death.date),
        deathPlace: indi.death.place || null
      };
    });

  return { events, people, families: famRecords };
}

module.exports = { parseGedcom, parseGedcomFull, parseDate };
