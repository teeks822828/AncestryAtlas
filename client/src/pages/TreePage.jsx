import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import Tree from 'react-d3-tree';
import { eventsApi, familyApi } from '../hooks/useApi';
import { useAuth } from '../context/AuthContext';

// Build a hierarchical tree from GEDCOM people + families
function buildGedcomTree(people, families) {
  if (!people.length) return null;

  const peopleMap = {};
  for (const p of people) {
    peopleMap[p.gedcom_id] = {
      name: p.name,
      attributes: {
        born: p.birth_date ? p.birth_date.substring(0, 4) : '',
        died: p.death_date ? p.death_date.substring(0, 4) : '',
        sex: p.sex || '',
        birthPlace: p.birth_place || '',
        deathPlace: p.death_place || '',
        birthDate: p.birth_date || '',
        deathDate: p.death_date || '',
      },
      gedcomId: p.gedcom_id,
      children: [],
      _hasParent: false,
    };
  }

  // Link children to parents via FAM records
  for (const fam of families) {
    const parentId = fam.husbandId || fam.wifeId;
    const parent = parentId ? peopleMap[parentId] : null;

    // If we have both husband and wife, attach wife as a "spouse" attribute
    if (fam.husbandId && fam.wifeId && peopleMap[fam.husbandId] && peopleMap[fam.wifeId]) {
      peopleMap[fam.husbandId].attributes.spouse = peopleMap[fam.wifeId].name;
      const wifeNode = peopleMap[fam.wifeId];
      const wifeBorn = wifeNode.attributes.born;
      const wifeDied = wifeNode.attributes.died;
      if (wifeBorn || wifeDied) {
        peopleMap[fam.husbandId].attributes.spouseYears =
          `${wifeBorn || '?'} - ${wifeDied || '?'}`;
      }
    }

    if (parent) {
      for (const childId of fam.childIds) {
        if (peopleMap[childId]) {
          parent.children.push(peopleMap[childId]);
          peopleMap[childId]._hasParent = true;
        }
      }
    }
  }

  // Find root nodes (people without parents)
  const roots = Object.values(peopleMap).filter(p => !p._hasParent);

  // Clean up helper props
  const cleanNode = (node) => {
    delete node._hasParent;
    delete node.gedcomId;
    if (node.children) node.children.forEach(cleanNode);
    return node;
  };

  if (roots.length === 0) return null;
  if (roots.length === 1) return cleanNode(roots[0]);

  // Multiple roots — wrap in a virtual root
  return {
    name: 'Ancestors',
    attributes: {},
    children: roots.map(cleanNode),
  };
}

// Build a tree from live family members + relationships
function buildFamilyTree(members, relationships) {
  if (!members.length) return null;

  const memberMap = {};
  for (const m of members) {
    memberMap[m.id] = {
      name: m.name,
      attributes: { memberId: m.id },
      children: [],
      _hasParent: false,
    };
  }

  // Process relationships: parent → child
  for (const rel of relationships) {
    if (rel.relationship === 'parent' && memberMap[rel.user_id] && memberMap[rel.related_user_id]) {
      // user_id is parent of related_user_id
      memberMap[rel.user_id].children.push(memberMap[rel.related_user_id]);
      memberMap[rel.related_user_id]._hasParent = true;
    }
    if (rel.relationship === 'spouse' && memberMap[rel.user_id] && memberMap[rel.related_user_id]) {
      if (!memberMap[rel.user_id].attributes.spouse) {
        memberMap[rel.user_id].attributes.spouse = memberMap[rel.related_user_id].name;
      }
    }
  }

  const roots = Object.values(memberMap).filter(p => !p._hasParent);

  const cleanNode = (node) => {
    delete node._hasParent;
    if (node.children) node.children.forEach(cleanNode);
    return node;
  };

  if (roots.length === 0) return null;
  if (roots.length === 1) return cleanNode(roots[0]);

  return {
    name: 'Family',
    attributes: {},
    children: roots.map(cleanNode),
  };
}

// Custom node renderer
function renderCustomNode({ nodeDatum, toggleNode }) {
  const sex = nodeDatum.attributes?.sex;
  const born = nodeDatum.attributes?.born;
  const died = nodeDatum.attributes?.died;
  const spouse = nodeDatum.attributes?.spouse;
  const spouseYears = nodeDatum.attributes?.spouseYears;

  let fillColor = '#6366f1'; // indigo default
  if (sex === 'M') fillColor = '#3b82f6'; // blue
  else if (sex === 'F') fillColor = '#ec4899'; // pink

  const yearRange = (born || died)
    ? `${born || '?'} - ${died || ''}`
    : '';

  return (
    <g>
      {/* Card background */}
      <rect
        x={-80}
        y={-30}
        width={160}
        height={spouse ? 72 : 52}
        rx={8}
        fill="white"
        stroke={fillColor}
        strokeWidth={2}
        style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.15))' }}
      />
      {/* Sex indicator dot */}
      <circle cx={-64} cy={-8} r={5} fill={fillColor} />
      {/* Name */}
      <text x={-54} y={-4} fontSize={12} fontWeight="600" fill="#1f2937">
        {nodeDatum.name.length > 18 ? nodeDatum.name.substring(0, 16) + '...' : nodeDatum.name}
      </text>
      {/* Year range */}
      {yearRange && (
        <text x={-54} y={12} fontSize={10} fill="#6b7280">
          {yearRange}
        </text>
      )}
      {/* Spouse info */}
      {spouse && (
        <>
          <line x1={-70} y1={22} x2={70} y2={22} stroke="#e5e7eb" strokeWidth={1} />
          <text x={-54} y={36} fontSize={10} fill="#9333ea">
            m. {spouse.length > 16 ? spouse.substring(0, 14) + '...' : spouse}
          </text>
          {spouseYears && (
            <text x={-54} y={48} fontSize={9} fill="#9ca3af">
              {spouseYears}
            </text>
          )}
        </>
      )}
    </g>
  );
}

export default function TreePage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('gedcom');
  const [gedcomTree, setGedcomTree] = useState(null);
  const [familyTree, setFamilyTree] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState(null);
  const treeContainerRef = useRef(null);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });

  // Center tree on mount
  useEffect(() => {
    if (treeContainerRef.current) {
      const { width, height } = treeContainerRef.current.getBoundingClientRect();
      setTranslate({ x: width / 2, y: 60 });
    }
  }, []);

  const fetchGedcomTree = useCallback(async () => {
    try {
      const response = await eventsApi.getGedcomTree();
      const { people, families } = response.data;
      const tree = buildGedcomTree(people || [], families || []);
      setGedcomTree(tree);
    } catch (err) {
      console.error('Failed to fetch GEDCOM tree:', err);
    }
  }, []);

  const fetchFamilyTree = useCallback(async () => {
    try {
      const response = await familyApi.getFamilyTree();
      const { members, relationships } = response.data;
      const tree = buildFamilyTree(members || [], relationships || []);
      setFamilyTree(tree);
    } catch (err) {
      console.error('Failed to fetch family tree:', err);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchGedcomTree(), fetchFamilyTree()]).finally(() => setLoading(false));
  }, [fetchGedcomTree, fetchFamilyTree]);

  const handleNodeClick = (nodeDatum) => {
    setSelectedNode(nodeDatum);
  };

  const currentTree = activeTab === 'gedcom' ? gedcomTree : familyTree;

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm" style={{ zIndex: 10000 }}>
        <div className="px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-indigo-600">Tree View</h1>
            {/* Tab toggle */}
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => { setActiveTab('gedcom'); setSelectedNode(null); }}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  activeTab === 'gedcom'
                    ? 'bg-white text-indigo-700 shadow-sm font-medium'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                GEDCOM Ancestors
              </button>
              <button
                onClick={() => { setActiveTab('family'); setSelectedNode(null); }}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  activeTab === 'family'
                    ? 'bg-white text-indigo-700 shadow-sm font-medium'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                Live Family
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/dashboard"
              className="px-4 py-2 rounded transition-colors whitespace-nowrap bg-blue-600 text-white hover:bg-blue-700 text-sm"
            >
              Dashboard
            </Link>
            <Link
              to="/family-tree"
              className="px-4 py-2 rounded transition-colors whitespace-nowrap bg-green-600 text-white hover:bg-green-700 text-sm"
            >
              Family Tree Map
            </Link>
          </div>
        </div>
      </header>

      {/* Tree area */}
      <div className="flex-1 relative bg-gray-50" ref={treeContainerRef}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mx-auto mb-3"></div>
              <p className="text-gray-500">Loading tree data...</p>
            </div>
          </div>
        ) : !currentTree ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md">
              <div className="text-5xl mb-4">
                {activeTab === 'gedcom' ? '\uD83C\uDF33' : '\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67\u200D\uD83D\uDC66'}
              </div>
              <h2 className="text-xl font-semibold text-gray-700 mb-2">
                {activeTab === 'gedcom' ? 'No GEDCOM Data' : 'No Family Relationships'}
              </h2>
              <p className="text-gray-500">
                {activeTab === 'gedcom'
                  ? 'Import a .ged file from the Family Tree Map page to see your ancestor tree here.'
                  : 'Set relationships between family members on the Dashboard to build your family tree.'}
              </p>
              <Link
                to={activeTab === 'gedcom' ? '/family-tree' : '/dashboard'}
                className="mt-4 inline-block px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm"
              >
                {activeTab === 'gedcom' ? 'Go to Family Tree Map' : 'Go to Dashboard'}
              </Link>
            </div>
          </div>
        ) : (
          <Tree
            data={currentTree}
            translate={translate}
            orientation="vertical"
            pathFunc="step"
            separation={{ siblings: 1.5, nonSiblings: 2 }}
            nodeSize={{ x: 200, y: 120 }}
            renderCustomNodeElement={(rd3tProps) =>
              renderCustomNode({
                ...rd3tProps,
                toggleNode: () => handleNodeClick(rd3tProps.nodeDatum),
              })
            }
            onNodeClick={(node) => handleNodeClick(node.data)}
            zoomable={true}
            draggable={true}
            collapsible={false}
          />
        )}

        {/* Node detail popup */}
        {selectedNode && (
          <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg border border-gray-200 p-4 w-72" style={{ zIndex: 100 }}>
            <div className="flex justify-between items-start mb-3">
              <h3 className="font-semibold text-gray-800">{selectedNode.name}</h3>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                x
              </button>
            </div>
            {selectedNode.attributes && (
              <div className="space-y-2 text-sm">
                {selectedNode.attributes.sex && (
                  <div className="flex gap-2">
                    <span className="text-gray-500">Sex:</span>
                    <span>{selectedNode.attributes.sex === 'M' ? 'Male' : selectedNode.attributes.sex === 'F' ? 'Female' : selectedNode.attributes.sex}</span>
                  </div>
                )}
                {selectedNode.attributes.birthDate && (
                  <div className="flex gap-2">
                    <span className="text-gray-500">Born:</span>
                    <span>{selectedNode.attributes.birthDate}</span>
                  </div>
                )}
                {selectedNode.attributes.birthPlace && (
                  <div className="flex gap-2">
                    <span className="text-gray-500">Birth place:</span>
                    <span className="text-xs">{selectedNode.attributes.birthPlace}</span>
                  </div>
                )}
                {selectedNode.attributes.deathDate && (
                  <div className="flex gap-2">
                    <span className="text-gray-500">Died:</span>
                    <span>{selectedNode.attributes.deathDate}</span>
                  </div>
                )}
                {selectedNode.attributes.deathPlace && (
                  <div className="flex gap-2">
                    <span className="text-gray-500">Death place:</span>
                    <span className="text-xs">{selectedNode.attributes.deathPlace}</span>
                  </div>
                )}
                {selectedNode.attributes.spouse && (
                  <div className="flex gap-2">
                    <span className="text-gray-500">Spouse:</span>
                    <span>{selectedNode.attributes.spouse}</span>
                  </div>
                )}
                {selectedNode.children && selectedNode.children.length > 0 && (
                  <div>
                    <span className="text-gray-500">Children: </span>
                    <span>{selectedNode.children.length}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
