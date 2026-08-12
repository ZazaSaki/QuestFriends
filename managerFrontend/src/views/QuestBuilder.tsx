import React, { useState, useCallback, useRef, useEffect } from 'react';
import { 
  ReactFlow, 
  Controls, 
  Background, 
  applyNodeChanges, 
  applyEdgeChanges, 
  addEdge,
  reconnectEdge,
  Node,
  Edge,
  Connection,
  NodeChange,
  EdgeChange,
  Handle,
  Position,
  NodeProps,
  OnSelectionChangeParams
} from '@xyflow/react';
import { Trash2, Settings, Plus, MapPin, ChevronDown, ChevronRight, GripVertical, Image as ImageIcon, Video, Music, Type, Save, Download, Upload, AlertTriangle, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { cn } from '../components/Layout';
import { MapContainer, TileLayer, CircleMarker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useParams, useNavigate } from 'react-router-dom';
import { getGame, createUser, createGame, createQuest, createTrack, appendWaypoints, updateGame, deleteGame } from '../lib/api';
import { gameToGraph, graphToPayload, builderToJSON, jsonToBuilder, findMissingLocations } from '../lib/questMapping';
import { uploadMedia } from '../lib/upload';
import { qrPngBlob, downloadBlob, slug } from '../lib/qrExport';
import { buildQrPack } from '../lib/qrPack';

type ContentType = 'Text' | 'Image' | 'Video' | 'Audio';

interface ContentBlock {
  id: string;
  type: ContentType;
  content: string;
}

const ContentBlockEditor = ({ blocks, setBlocks }: { blocks: ContentBlock[], setBlocks: React.Dispatch<React.SetStateAction<ContentBlock[]>> }) => {
  const [selectedType, setSelectedType] = useState<ContentType>('Text');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [uploadErr, setUploadErr] = useState<Record<string, string>>({});

  const addBlock = () => {
    setBlocks([...blocks, { id: Math.random().toString(36).substr(2, 9), type: selectedType, content: '' }]);
  };

  const removeBlock = (id: string) => {
    setBlocks(blocks.filter(b => b.id !== id));
  };

  const updateBlock = (id: string, content: string) => {
    setBlocks(blocks.map(b => b.id === id ? { ...b, content } : b));
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    // Small delay to allow the drag image to be generated before styling changes
    setTimeout(() => {
      if (e.target instanceof HTMLElement) {
        e.target.style.opacity = '0.5';
      }
    }, 0);
  };

  const handleDragEnter = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newBlocks = [...blocks];
    const draggedBlock = newBlocks[draggedIndex];
    newBlocks.splice(draggedIndex, 1);
    newBlocks.splice(index, 0, draggedBlock);

    setBlocks(newBlocks);
    setDraggedIndex(index);
  };

  const handleDragEnd = (e: React.DragEvent) => {
    setDraggedIndex(null);
    if (e.target instanceof HTMLElement) {
      e.target.style.opacity = '1';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <select 
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value as ContentType)}
          className="flex-1 block w-full pl-3 pr-10 py-2 text-base border-neutral-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md border"
        >
          <option value="Text">Text</option>
          <option value="Image">Image</option>
          <option value="Video">Video</option>
          <option value="Audio">Audio</option>
        </select>
        <button onClick={addBlock} className="px-3 py-2 bg-neutral-100 text-neutral-600 rounded-md hover:bg-neutral-200 border border-neutral-200">
          Add
        </button>
      </div>
      
      <div className="space-y-3">
        {blocks.map((block, index) => (
          <div 
            key={block.id} 
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragEnter={(e) => handleDragEnter(e, index)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => e.preventDefault()}
            className={cn(
              "flex items-start gap-2 bg-white p-3 border border-neutral-200 rounded-md shadow-sm group cursor-move transition-transform duration-200",
              draggedIndex === index ? "opacity-50" : ""
            )}
          >
            <div className="mt-1 text-neutral-400">
              <GripVertical className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                {block.type === 'Text' && <Type className="w-3 h-3" />}
                {block.type === 'Image' && <ImageIcon className="w-3 h-3" />}
                {block.type === 'Video' && <Video className="w-3 h-3" />}
                {block.type === 'Audio' && <Music className="w-3 h-3" />}
                {block.type}
              </div>
              {block.type === 'Text' ? (
                <textarea
                  value={block.content}
                  onChange={(e) => updateBlock(block.id, e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="Enter text..."
                />
              ) : (
                <div className="flex items-center justify-center w-full">
                  {block.content ? (
                    <div className="w-full relative">
                      {block.type === 'Image' && <img src={block.content} alt="Preview" className="w-full h-40 object-cover rounded-md" />}
                      {block.type === 'Video' && <video src={block.content} controls className="w-full h-40 object-cover rounded-md" />}
                      {block.type === 'Audio' && <audio src={block.content} controls className="w-full" />}
                      <button 
                        onClick={() => updateBlock(block.id, '')}
                        className="absolute top-2 right-2 p-1 bg-white/80 hover:bg-white text-red-500 rounded-md shadow-sm"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <label className={cn(
                      "flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-lg bg-neutral-50",
                      uploading[block.id] ? "border-indigo-300 cursor-wait" : "border-neutral-300 cursor-pointer hover:bg-neutral-100"
                    )}>
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        {uploading[block.id] ? (
                          <p className="text-sm text-indigo-600 font-medium">Uploading to MinIO…</p>
                        ) : (
                          <>
                            <p className="mb-2 text-sm text-neutral-500"><span className="font-semibold">Click to upload</span> {block.type}</p>
                            {uploadErr[block.id] && <p className="text-xs text-red-600">{uploadErr[block.id]}</p>}
                          </>
                        )}
                      </div>
                      <input
                        type="file"
                        className="hidden"
                        disabled={!!uploading[block.id]}
                        accept={block.type === 'Image' ? 'image/*' : block.type === 'Video' ? 'video/*' : 'audio/*'}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (!file) return;
                          setUploadErr((u) => ({ ...u, [block.id]: '' }));
                          setUploading((u) => ({ ...u, [block.id]: true }));
                          try {
                            const url = await uploadMedia(file);
                            updateBlock(block.id, url);
                          } catch (err) {
                            setUploadErr((u) => ({ ...u, [block.id]: (err as Error).message }));
                          } finally {
                            setUploading((u) => ({ ...u, [block.id]: false }));
                          }
                        }}
                      />
                    </label>
                  )}
                </div>
              )}
            </div>
            <button onClick={() => removeBlock(block.id)} className="text-neutral-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

const QuestNode = ({ data, selected }: NodeProps) => {
  return (
    <div className={cn("px-4 py-3 shadow-sm rounded-md bg-white border-2 min-w-[150px] transition-all", selected ? "border-indigo-500 ring-4 ring-indigo-500/20" : "border-neutral-200")}>
      <Handle type="target" position={Position.Top} className="w-2 h-2 !bg-indigo-500 border-none" />
      
      <div className="flex flex-col gap-2">
        <div className="font-semibold text-neutral-900 text-sm text-center">{data.label as string}</div>
        <button 
          className={cn(
            "w-full py-1.5 text-xs font-medium rounded transition-colors",
            selected 
              ? "bg-indigo-600 text-white shadow-inner" 
              : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
          )}
        >
          {selected ? 'Selected' : 'Select'}
        </button>
      </div>

      <Handle type="source" position={Position.Bottom} className="w-2 h-2 !bg-indigo-500 border-none" />
    </div>
  );
};

const nodeTypes = {
  quest: QuestNode,
};

// Default game: Introduction → Quest 1 → Conclusion (exactly one quest).
const makeDefaultNodes = (): Node[] => [
  { id: 'intro', type: 'quest', position: { x: 250, y: 50 }, data: { role: 'intro', label: 'Introduction', descriptionBlocks: [{ id: 'b1', type: 'Text', content: '' }] } },
  { id: 'q1', type: 'quest', position: { x: 250, y: 180 }, data: { role: 'quest', label: 'Quest 1' } },
  { id: 'conclusion', type: 'quest', position: { x: 250, y: 310 }, data: { role: 'conclusion', label: 'Conclusion', descriptionBlocks: [{ id: 'b1', type: 'Text', content: '' }] } },
];
const makeDefaultEdges = (): Edge[] => [
  { id: 'e-intro-q1', source: 'intro', target: 'q1', animated: true },
  { id: 'e-q1-conclusion', source: 'q1', target: 'conclusion', animated: true },
];

const initialNodes: Node[] = makeDefaultNodes();
const initialEdges: Edge[] = makeDefaultEdges();

export interface QuizQuestionData {
  id: string;
  question: string;
  options: string[];
  correctOptionIndex: number;
}

const MapSelectionModal = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  initialCenter 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  onConfirm: (lat: number, lng: number) => void, 
  initialCenter: [number, number] 
}) => {
  const [selectedPos, setSelectedPos] = useState<[number, number]>(initialCenter);

  const MapEvents = () => {
    useMapEvents({
      click(e) {
        setSelectedPos([e.latlng.lat, e.latlng.lng]);
      }
    });
    return null;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl w-[90vw] max-w-2xl overflow-hidden flex flex-col">
        <div className="p-4 border-b border-neutral-200 flex items-center justify-between bg-neutral-50">
          <h3 className="font-semibold text-neutral-900">Select Location</h3>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-700 text-xl leading-none">&times;</button>
        </div>
        <div className="h-[60vh] relative z-0">
          <MapContainer center={initialCenter} zoom={13} className="w-full h-full">
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <CircleMarker center={selectedPos} radius={8} pathOptions={{ color: '#4f46e5', fillColor: '#4f46e5', fillOpacity: 0.8 }} />
            <MapEvents />
          </MapContainer>
        </div>
        <div className="p-4 border-t border-neutral-200 flex justify-between items-center bg-neutral-50">
          <div className="text-sm font-mono text-neutral-500">
            {selectedPos[0].toFixed(5)}, {selectedPos[1].toFixed(5)}
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 border border-neutral-300 rounded text-neutral-700 hover:bg-neutral-100 transition-colors font-medium text-sm">Cancel</button>
            <button onClick={() => onConfirm(selectedPos[0], selectedPos[1])} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors font-medium text-sm">Confirm Location</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const NodeEditor = ({
  node,
  totalTracks,
  onDelete,
  onUpdateTitle,
  onPatch,
  globalLastMapCenter,
  setGlobalLastMapCenter
}: {
  node: Node,
  totalTracks: number,
  onDelete: () => void,
  onUpdateTitle: (title: string) => void,
  onPatch: (nodeId: string, patch: Record<string, unknown>) => void,
  globalLastMapCenter: [number, number],
  setGlobalLastMapCenter: (pos: [number, number]) => void
}) => {
  // Initialise from node.data so a loaded game hydrates the editor; falls back
  // to empty defaults for brand-new nodes. (This component remounts per node
  // via key={node.id}, so reading node.data on mount is sufficient.)
  const d = node.data as Record<string, any>;
  const nodeRole = (d.role as string) ?? 'quest';
  const isQuest = nodeRole === 'quest';
  const [points, setPoints] = useState<number>(typeof d.points === 'number' ? d.points : 100);
  const [descriptionBlocks, setDescriptionBlocks] = useState<ContentBlock[]>(d.descriptionBlocks ?? [{ id: '1', type: 'Text', content: '' }]);
  const [rewardBlocks, setRewardBlocks] = useState<ContentBlock[]>(d.rewardBlocks ?? []);
  const [expandedSection, setExpandedSection] = useState<string | null>('description');
  const [challengeMode, setChallengeMode] = useState<string>(d.challengeMode ?? 'None');
  const [challengeCode, setChallengeCode] = useState<string>(d.challengeCode ?? '');
  const [confirmationMode, setConfirmationMode] = useState<string>(d.confirmationMode ?? 'Quiz');
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestionData[]>(d.quizQuestions ?? [{ id: '1', question: '', options: ['', ''], correctOptionIndex: 0 }]);
  const [nodeTracks, setNodeTracks] = useState<{id: string, name: string, coordinate: string}[]>(d.nodeTracks ?? [{ id: '1', name: 'Track 1', coordinate: '' }]);

  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [activeTrackIndex, setActiveTrackIndex] = useState<number | null>(null);

  // Persist editor state back into node.data (session-level; backend Save is
  // a later round). One-way sync — node.data is the store, local state the UI.
  useEffect(() => {
    onPatch(node.id, { points, descriptionBlocks, rewardBlocks, challengeMode, challengeCode, confirmationMode, quizQuestions, nodeTracks });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, descriptionBlocks, rewardBlocks, challengeMode, challengeCode, confirmationMode, quizQuestions, nodeTracks]);

  const addTrack = () => {
    const nextNum = nodeTracks.length + 1;
    setNodeTracks([...nodeTracks, { id: Math.random().toString(36).substr(2, 9), name: `Track ${nextNum}`, coordinate: '' }]);
  };

  return (
    <>
      <div className="flex flex-col h-full overflow-y-auto">
        {/* Header */}
      <div className="p-4 border-b border-neutral-200 bg-neutral-50 sticky top-0 z-10 flex items-start justify-between gap-4">
        <div className="flex-1 space-y-3">
          <div>
            <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Quest Title</label>
            <input 
              type="text" 
              value={node.data.label as string}
              onChange={(e) => onUpdateTitle(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>
          {isQuest && (
            <div>
              <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Points</label>
              <input
                type="number"
                value={points}
                onChange={(e) => setPoints(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
            </div>
          )}
        </div>
        <button onClick={onDelete} className="p-2 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors mt-5">
          <Trash2 className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 space-y-4 pb-20">
        {/* Description Block */}
        <div className="border border-neutral-200 rounded-md bg-white overflow-hidden shadow-sm">
          <button 
            onClick={() => setExpandedSection(expandedSection === 'description' ? null : 'description')}
            className="w-full px-4 py-3 flex items-center justify-between bg-neutral-50 hover:bg-neutral-100 transition-colors border-b border-transparent data-[state=open]:border-neutral-200"
            data-state={expandedSection === 'description' ? 'open' : 'closed'}
          >
            <h4 className="font-semibold text-neutral-900">Description</h4>
            {expandedSection === 'description' ? <ChevronDown className="w-4 h-4 text-neutral-500" /> : <ChevronRight className="w-4 h-4 text-neutral-500" />}
          </button>
          {expandedSection === 'description' && (
            <div className="p-4">
              <ContentBlockEditor blocks={descriptionBlocks} setBlocks={setDescriptionBlocks} />
            </div>
          )}
        </div>

        {isQuest && (<>
        {/* Challenge Block */}
        <div className="border border-neutral-200 rounded-md bg-white overflow-hidden shadow-sm">
          <button
            onClick={() => setExpandedSection(expandedSection === 'challenge' ? null : 'challenge')}
            className="w-full px-4 py-3 flex items-center justify-between bg-neutral-50 hover:bg-neutral-100 transition-colors border-b border-transparent data-[state=open]:border-neutral-200"
            data-state={expandedSection === 'challenge' ? 'open' : 'closed'}
          >
            <h4 className="font-semibold text-neutral-900">Challenge Mode</h4>
            {expandedSection === 'challenge' ? <ChevronDown className="w-4 h-4 text-neutral-500" /> : <ChevronRight className="w-4 h-4 text-neutral-500" />}
          </button>
          {expandedSection === 'challenge' && (
            <div className="p-4 space-y-4">
              <div className="flex gap-4">
                {['None', 'QR', 'Code'].map(mode => (
                  <label key={mode} className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio" 
                      name={`challenge-${node.id}`} 
                      className="text-indigo-600 focus:ring-indigo-500" 
                      checked={challengeMode === mode}
                      onChange={() => setChallengeMode(mode)}
                    />
                    <span className="text-sm text-neutral-700">{mode}</span>
                  </label>
                ))}
              </div>
              
              {(challengeMode === 'QR' || challengeMode === 'Code') && (
                <div className="space-y-3 pt-3 border-t border-neutral-100">
                  <div>
                    <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Target Code</label>
                    <input 
                      type="text"
                      value={challengeCode}
                      onChange={(e) => setChallengeCode(e.target.value)}
                      placeholder="Enter code to match..."
                      className="w-full px-3 py-2 border border-neutral-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    />
                  </div>
                  {challengeMode === 'QR' && challengeCode && (
                    <div className="flex flex-col items-center justify-center p-4 bg-neutral-50 border border-neutral-200 rounded-md">
                      <p className="text-xs text-neutral-500 mb-3 font-medium uppercase">QR Code Preview</p>
                      <QRCodeSVG value={challengeCode} size={128} />
                      <button
                        onClick={async () => {
                          downloadBlob(await qrPngBlob(challengeCode), `${slug(String(d.label ?? 'quest'))}_qrCode.png`);
                        }}
                        className="mt-3 flex items-center gap-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-md transition-colors"
                        title="Download this QR code as a PNG"
                      >
                        <Download className="w-3.5 h-3.5" /> Download PNG
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Confirmation Block */}
        <div className="border border-neutral-200 rounded-md bg-white overflow-hidden shadow-sm">
          <button 
            onClick={() => setExpandedSection(expandedSection === 'confirmation' ? null : 'confirmation')}
            className="w-full px-4 py-3 flex items-center justify-between bg-neutral-50 hover:bg-neutral-100 transition-colors border-b border-transparent data-[state=open]:border-neutral-200"
            data-state={expandedSection === 'confirmation' ? 'open' : 'closed'}
          >
            <h4 className="font-semibold text-neutral-900">Confirmation</h4>
            {expandedSection === 'confirmation' ? <ChevronDown className="w-4 h-4 text-neutral-500" /> : <ChevronRight className="w-4 h-4 text-neutral-500" />}
          </button>
          {expandedSection === 'confirmation' && (
            <div className="p-4 space-y-4">
              <select 
                value={confirmationMode}
                onChange={(e) => setConfirmationMode(e.target.value)}
                className="block w-full pl-3 pr-10 py-2 text-base border-neutral-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md border"
              >
                <option value="Quiz">Quiz</option>
                <option value="Image Upload">Image Upload</option>
                <option value="Video Upload">Video Upload</option>
              </select>

              {confirmationMode === 'Quiz' && (
                <div className="space-y-6 pt-3 border-t border-neutral-100">
                  {quizQuestions.map((q, qIndex) => (
                    <div key={q.id} className="space-y-4 bg-neutral-50 p-4 rounded-md border border-neutral-200 relative group">
                      <button 
                        onClick={() => setQuizQuestions(quizQuestions.filter((_, i) => i !== qIndex))}
                        className="absolute top-2 right-2 p-1.5 text-neutral-400 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-opacity bg-white border border-neutral-200 shadow-sm"
                        title="Remove Question"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      
                      <div>
                        <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Question {qIndex + 1}</label>
                        <textarea 
                          rows={2}
                          value={q.question}
                          onChange={(e) => {
                            const newQs = [...quizQuestions];
                            newQs[qIndex].question = e.target.value;
                            setQuizQuestions(newQs);
                          }}
                          className="w-full px-3 py-2 border border-neutral-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                          placeholder="Enter the quiz question..."
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="block text-xs font-medium text-neutral-500 uppercase tracking-wider">Options</label>
                          <button 
                            onClick={() => {
                              const newQs = [...quizQuestions];
                              newQs[qIndex].options.push('');
                              setQuizQuestions(newQs);
                            }}
                            className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                          >
                            + Add Option
                          </button>
                        </div>
                        {q.options.map((opt, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <input 
                              type="radio" 
                              name={`correct_option_${q.id}`}
                              className="text-emerald-600 focus:ring-emerald-500" 
                              checked={q.correctOptionIndex === idx}
                              onChange={() => {
                                const newQs = [...quizQuestions];
                                newQs[qIndex].correctOptionIndex = idx;
                                setQuizQuestions(newQs);
                              }}
                            />
                            <input 
                              type="text"
                              value={opt}
                              onChange={(e) => {
                                const newQs = [...quizQuestions];
                                newQs[qIndex].options[idx] = e.target.value;
                                setQuizQuestions(newQs);
                              }}
                              className="flex-1 px-3 py-1.5 border border-neutral-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white"
                              placeholder={`Option ${idx + 1}`}
                            />
                            <button 
                              onClick={() => {
                                const newQs = [...quizQuestions];
                                newQs[qIndex].options = newQs[qIndex].options.filter((_, i) => i !== idx);
                                if (newQs[qIndex].correctOptionIndex >= newQs[qIndex].options.length) {
                                  newQs[qIndex].correctOptionIndex = Math.max(0, newQs[qIndex].options.length - 1);
                                }
                                setQuizQuestions(newQs);
                              }}
                              className="p-1.5 text-neutral-400 hover:text-red-500 rounded bg-white border border-neutral-200"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  
                  <button 
                    onClick={() => setQuizQuestions([...quizQuestions, { id: Math.random().toString(36).substr(2, 9), question: '', options: ['', ''], correctOptionIndex: 0 }])}
                    className="w-full py-2 border-2 border-dashed border-neutral-300 rounded-md text-sm font-medium text-neutral-600 hover:border-indigo-400 hover:text-indigo-600 transition-colors flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" /> Add Another Question
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Reward Block */}
        <div className="border border-neutral-200 rounded-md bg-white overflow-hidden shadow-sm">
          <button 
            onClick={() => setExpandedSection(expandedSection === 'reward' ? null : 'reward')}
            className="w-full px-4 py-3 flex items-center justify-between bg-neutral-50 hover:bg-neutral-100 transition-colors border-b border-transparent data-[state=open]:border-neutral-200"
            data-state={expandedSection === 'reward' ? 'open' : 'closed'}
          >
            <h4 className="font-semibold text-neutral-900">Reward Event</h4>
            {expandedSection === 'reward' ? <ChevronDown className="w-4 h-4 text-neutral-500" /> : <ChevronRight className="w-4 h-4 text-neutral-500" />}
          </button>
          {expandedSection === 'reward' && (
            <div className="p-4">
              <ContentBlockEditor blocks={rewardBlocks} setBlocks={setRewardBlocks} />
            </div>
          )}
        </div>

        {/* Tracks Table */}
        <div className="border border-neutral-200 rounded-md bg-white overflow-hidden shadow-sm">
          <button 
            onClick={() => setExpandedSection(expandedSection === 'tracks' ? null : 'tracks')}
            className="w-full px-4 py-3 flex items-center justify-between bg-neutral-50 hover:bg-neutral-100 transition-colors border-b border-transparent data-[state=open]:border-neutral-200"
            data-state={expandedSection === 'tracks' ? 'open' : 'closed'}
          >
            <h4 className="font-semibold text-neutral-900">Tracks & Locations</h4>
            {expandedSection === 'tracks' ? <ChevronDown className="w-4 h-4 text-neutral-500" /> : <ChevronRight className="w-4 h-4 text-neutral-500" />}
          </button>
          {expandedSection === 'tracks' && (
            <div className="p-4">
              {nodeTracks.length < totalTracks && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md text-amber-700 text-sm flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p>Warning: This quest step has {nodeTracks.length} track(s) defined, but the game requires {totalTracks}. Please add more locations.</p>
                </div>
              )}
              
              <div className="flex justify-end mb-2">
                <button onClick={addTrack} className="text-indigo-600 hover:text-indigo-700 p-1 rounded hover:bg-indigo-50 flex items-center gap-1 text-xs font-medium">
                  <Plus className="w-4 h-4" /> Add Track
                </button>
              </div>
              <div className="border border-neutral-200 rounded-md overflow-hidden">
                <table className="min-w-full divide-y divide-neutral-200 text-sm">
                  <thead className="bg-neutral-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-neutral-500">Track</th>
                      <th className="px-3 py-2 text-left font-medium text-neutral-500">Coordinate</th>
                      <th className="px-3 py-2 text-right font-medium text-neutral-500">Action</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-neutral-200">
                    {nodeTracks.map((track, i) => (
                      <tr key={track.id}>
                        <td className="px-3 py-2">
                          <input 
                            type="text" 
                            value={track.name}
                            onChange={(e) => {
                              const newTracks = [...nodeTracks];
                              newTracks[i].name = e.target.value;
                              setNodeTracks(newTracks);
                            }}
                            className="w-full px-2 py-1 text-sm border border-transparent hover:border-neutral-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded"
                          />
                        </td>
                        <td className="px-3 py-2 text-neutral-500 flex items-center gap-1">
                          <button 
                            onClick={() => {
                              setActiveTrackIndex(i);
                              setIsMapModalOpen(true);
                            }}
                            className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded transition-colors shrink-0"
                            title="Select on map"
                          >
                            <MapPin className="w-4 h-4" />
                          </button>
                          <input 
                            type="text" 
                            placeholder="e.g. 51.505, -0.09"
                            value={track.coordinate}
                            onChange={(e) => {
                              const newTracks = [...nodeTracks];
                              newTracks[i].coordinate = e.target.value;
                              setNodeTracks(newTracks);
                            }}
                            className="w-full px-2 py-1 text-sm border border-transparent hover:border-neutral-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button 
                            onClick={() => setNodeTracks(nodeTracks.filter(t => t.id !== track.id))}
                            className="text-red-500 hover:text-red-700"
                          ><Trash2 className="w-4 h-4 inline" /></button>
                        </td>
                      </tr>
                    ))}
                    {nodeTracks.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-3 py-4 text-center text-neutral-500">No tracks added yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        </>)}
      </div>
      </div>

      <MapSelectionModal
        isOpen={isMapModalOpen}
        onClose={() => {
          setIsMapModalOpen(false);
          setActiveTrackIndex(null);
        }}
        initialCenter={globalLastMapCenter}
        onConfirm={(lat, lng) => {
          if (activeTrackIndex !== null) {
            const newTracks = [...nodeTracks];
            newTracks[activeTrackIndex].coordinate = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
            setNodeTracks(newTracks);
          }
          setGlobalLastMapCenter([lat, lng]);
          setIsMapModalOpen(false);
          setActiveTrackIndex(null);
        }}
      />
    </>
  );
};

let GLOBAL_LAST_MAP_CENTER: [number, number] = [51.505, -0.09];

export default function QuestBuilder() {
  const { gameId } = useParams<{ gameId?: string }>();
  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [totalTracks, setTotalTracks] = useState(3);
  const [gameName, setGameName] = useState('My Awesome Game');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [globalLastMapCenter, setGlobalLastMapCenter] = useState<[number, number]>(GLOBAL_LAST_MAP_CENTER);

  // Editing an existing game: hydrate the graph + settings from the backend.
  useEffect(() => {
    if (!gameId) return;
    let cancelled = false;
    setLoadError(null);
    getGame(gameId)
      .then((game) => {
        if (cancelled) return;
        setGameName(game.title);
        setTotalTracks(Math.max(1, game.tracks.length));
        const { nodes: n, edges: e } = gameToGraph(game);
        setNodes(n.length ? n : initialNodes);
        setEdges(e);
        setSelectedNodeId(null);
      })
      .catch((err) => { if (!cancelled) setLoadError((err as Error).message); });
    return () => { cancelled = true; };
  }, [gameId]);

  // Sync to global variable
  useEffect(() => {
    GLOBAL_LAST_MAP_CENTER = globalLastMapCenter;
  }, [globalLastMapCenter]);

  const selectedNode = nodes.find(n => n.id === selectedNodeId) || null;

  // Resizable sidebar state
  const [sidebarWidth, setSidebarWidth] = useState(400);
  const isResizing = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [isGameSettingsExpanded, setIsGameSettingsExpanded] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current || !containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - containerRect.left;
      setSidebarWidth(Math.max(300, Math.min(newWidth, 800)));
    };
    
    const handleMouseUp = () => {
      if (isResizing.current) {
        isResizing.current = false;
        document.body.style.cursor = 'default';
        document.body.style.userSelect = 'auto';
      }
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );
  
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );
  
  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    []
  );

  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => setEdges((eds) => reconnectEdge(oldEdge, newConnection, eds)),
    []
  );

  const onReconnectEnd = useCallback(
    (_: any, edge: Edge, __: any, connectionState: any) => {
      if (!connectionState.isValid) {
        setEdges((eds) => eds.filter((e) => e.id !== edge.id));
      }
    },
    []
  );

  const onSelectionChange = useCallback(({ nodes }: OnSelectionChangeParams) => {
    if (nodes.length > 0) {
      setSelectedNodeId(nodes[0].id);
    } else {
      setSelectedNodeId(null);
    }
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const updateNodeTitle = useCallback((title: string) => {
    if (!selectedNodeId) return;
    setNodes(nds => nds.map(n => n.id === selectedNodeId ? { ...n, data: { ...n.data, label: title } } : n));
  }, [selectedNodeId]);

  const updateNodeData = useCallback((nodeId: string, patch: Record<string, unknown>) => {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n));
  }, []);

  // ---- Toolbar: Save / Download / Upload / Delete ----
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [packing, setPacking] = useState(false);

  const flash = (kind: 'ok' | 'err', msg: string) => {
    setStatus({ kind, msg });
    setTimeout(() => setStatus(null), 5000);
  };

  const handleSave = useCallback(async () => {
    // Safety net: never persist an un-uploaded in-browser blob URL.
    const hasBlob = nodes.some((n) => {
      const d = n.data as any;
      return [...(d.descriptionBlocks || []), ...(d.rewardBlocks || [])]
        .some((b: any) => typeof b.content === 'string' && b.content.startsWith('blob:'));
    });
    if (hasBlob) {
      flash('err', 'Some media is still uploading (or failed). Re-add it, then Save.');
      return;
    }
    // Every quest needs a coordinate on every track — a blank one would be
    // dropped from the payload, leaving that track missing a stop.
    const missing = findMissingLocations(totalTracks, nodes);
    if (missing.length) {
      const shown = missing.slice(0, 3).join(', ');
      flash('err', `Missing location: ${shown}${missing.length > 3 ? ` (+${missing.length - 3} more)` : ''}`);
      return;
    }
    setSaving(true);
    try {
      const payload = graphToPayload(totalTracks, nodes);

      if (gameId) {
        // Edit the current game in place (same id).
        await updateGame(gameId, {
          title: gameName || 'Untitled Game',
          introduction: payload.introduction,
          conclusion: payload.conclusion,
          quests: payload.quests,
          tracks: payload.tracks,
        });
        flash('ok', 'Game updated.');
        return;
      }

      // New game: create game → quests → tracks + waypoints.
      const creator = await createUser('manager-ui', 'MANAGER');
      const game = await createGame({
        title: gameName || 'Untitled Game',
        introduction: payload.introduction,
        conclusion: payload.conclusion,
        creatorId: creator.id,
      });
      const questIds: string[] = [];
      for (const q of payload.quests) {
        const created = await createQuest({ gameId: game.id, ...q });
        questIds.push(created.id);
      }
      for (const tr of payload.tracks) {
        const track = await createTrack(game.id, tr.name);
        const wps = tr.waypoints
          .filter((w) => questIds[w.questIndex])
          .map((w) => ({ questId: questIds[w.questIndex], sequenceOrder: w.sequenceOrder, latitude: w.latitude, longitude: w.longitude, radius: 20 }));
        if (wps.length) await appendWaypoints(track.id, wps);
      }
      flash('ok', 'Game saved.');
      navigate(`/builder/${game.id}`);
    } catch (e) {
      flash('err', 'Save failed: ' + (e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [totalTracks, nodes, gameName, gameId, navigate]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([builderToJSON({ gameName, totalTracks, nodes, edges })], { type: 'application/json' });
    downloadBlob(blob, `${slug(gameName || 'game')}.json`);
  }, [gameName, totalTracks, nodes, edges]);

  // Zip of every quest QR code + every quest image, named by quest position.
  const handleDownloadQrPack = useCallback(async () => {
    setPacking(true);
    try {
      const pack = await buildQrPack(gameName, nodes);
      if (!pack.qrCount && !pack.imageCount) {
        flash('err', 'Nothing to export: no QR codes or images in this game.');
        return;
      }
      downloadBlob(pack.blob, pack.filename);
      const summary = `${pack.qrCount} QR code(s), ${pack.imageCount} image(s)`;
      if (pack.failed.length) {
        flash('err', `Exported ${summary} — ${pack.failed.length} image(s) failed, see manifest.txt`);
      } else {
        flash('ok', `Exported ${summary}.`);
      }
    } catch (e) {
      flash('err', 'QR pack failed: ' + (e as Error).message);
    } finally {
      setPacking(false);
    }
  }, [gameName, nodes]);

  const handleUploadFile = useCallback(async (file: File) => {
    try {
      const state = jsonToBuilder(await file.text());
      setGameName(state.gameName);
      setTotalTracks(state.totalTracks);
      setNodes(state.nodes);
      setEdges(state.edges);
      setSelectedNodeId(null);
      flash('ok', 'Loaded from file.');
    } catch (e) {
      flash('err', 'Upload failed: ' + (e as Error).message);
    }
  }, []);

  const handleDelete = useCallback(async () => {
    if (gameId) {
      if (!window.confirm('Delete this game and all its rooms/quests/tracks? This cannot be undone.')) return;
      try {
        await deleteGame(gameId);
        navigate('/');
      } catch (e) {
        flash('err', 'Delete failed: ' + (e as Error).message);
      }
    } else {
      if (!window.confirm('Clear the builder back to the default game?')) return;
      setGameName('My Awesome Game');
      setNodes(makeDefaultNodes());
      setEdges(makeDefaultEdges());
      setSelectedNodeId(null);
    }
  }, [gameId, navigate]);

  const deleteNode = useCallback(() => {
    if (!selectedNodeId) return;
    setNodes(nds => nds.filter(n => n.id !== selectedNodeId));
    setSelectedNodeId(null);
  }, [selectedNodeId]);

  return (
    <div ref={containerRef} className="flex h-full w-full">
      {/* Left Sidebar: Quest Settings */}
      <div 
        style={{ width: sidebarWidth }}
        className="border-r border-neutral-200 bg-white flex flex-col z-10 shadow-lg shrink-0 relative"
      >
        {/* Resizer Handle */}
        <div 
          onMouseDown={startResizing}
          className="absolute top-0 -right-1.5 bottom-0 w-3 cursor-col-resize z-20 group hover:bg-indigo-500/10 flex items-center justify-center transition-colors"
        >
          <div className="w-0.5 h-8 bg-neutral-300 group-hover:bg-indigo-400 rounded-full" />
        </div>
        
        {/* Game Menu Header (Expandable) */}
        <div 
          className="border-b border-neutral-200 bg-indigo-50 flex flex-col transition-all duration-300 ease-in-out relative z-30"
          onMouseEnter={() => setIsGameSettingsExpanded(true)}
          onMouseLeave={() => setIsGameSettingsExpanded(false)}
        >
          <div className="p-4 flex items-center justify-between cursor-pointer">
            <div>
              <h2 className="font-bold text-indigo-900">Game Configuration</h2>
              {gameId && <p className="text-xs text-indigo-500 mt-0.5">Editing: {gameName}</p>}
            </div>
            <Settings className="w-5 h-5 text-indigo-500" />
          </div>
          
          <div 
            className={cn(
              "px-4 overflow-hidden transition-all duration-300 ease-in-out",
              isGameSettingsExpanded ? "max-h-[300px] pb-4 opacity-100" : "max-h-0 opacity-0"
            )}
          >
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-indigo-700 uppercase tracking-wider mb-1">Game Name</label>
                <input
                  type="text"
                  value={gameName}
                  onChange={(e) => setGameName(e.target.value)}
                  className="w-full px-3 py-2 border border-indigo-200 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white"
                />
              </div>
              
              <div>
                <label className="block text-xs font-medium text-indigo-700 uppercase tracking-wider mb-1">Total Tracks Amount</label>
                <input 
                  type="number" 
                  value={totalTracks}
                  onChange={(e) => setTotalTracks(parseInt(e.target.value) || 1)}
                  min={1}
                  className="w-full px-3 py-2 border border-indigo-200 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white"
                />
                <p className="text-xs text-indigo-500 mt-1">Defines how many locations are needed per quest.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Node Editor */}
        {!selectedNode ? (
          <div className="flex-1 flex flex-col items-center justify-center text-neutral-400 p-6 text-center">
            <Settings className="w-12 h-12 mb-4 text-neutral-200" />
            <p>Select a quest node on the canvas to edit its properties.</p>
          </div>
        ) : (
          <div key={selectedNode.id} className="h-full overflow-hidden">
            <NodeEditor
              node={selectedNode}
              totalTracks={totalTracks}
              onDelete={deleteNode}
              onUpdateTitle={updateNodeTitle}
              onPatch={updateNodeData}
              globalLastMapCenter={globalLastMapCenter}
              setGlobalLastMapCenter={setGlobalLastMapCenter}
            />
          </div>
        )}
      </div>

      {/* Right Canvas (70%) */}
      <div className="flex-1 relative bg-neutral-50">
        {loadError && (
          <div className="absolute top-4 left-4 z-20 bg-red-600 text-white text-sm px-3 py-2 rounded-md shadow">
            Failed to load game: {loadError}
          </div>
        )}
        {/* Top Right Options Header overlay */}
        <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
          {status && (
            <span className={cn('px-3 py-1.5 rounded-md text-sm shadow-sm', status.kind === 'ok' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white')}>
              {status.msg}
            </span>
          )}
          <button onClick={handleSave} disabled={saving} className="p-2 bg-white border border-neutral-200 text-neutral-600 rounded-md shadow-sm hover:bg-neutral-50 hover:text-emerald-600 transition-colors disabled:opacity-50" title="Save (creates a new game)">
            <Save className="w-4 h-4" />
          </button>
          <button onClick={handleDownload} className="p-2 bg-white border border-neutral-200 text-neutral-600 rounded-md shadow-sm hover:bg-neutral-50 hover:text-indigo-600 transition-colors" title="Download JSON">
            <Download className="w-4 h-4" />
          </button>
          <button onClick={handleDownloadQrPack} disabled={packing} className="p-2 bg-white border border-neutral-200 text-neutral-600 rounded-md shadow-sm hover:bg-neutral-50 hover:text-indigo-600 transition-colors disabled:opacity-50" title="Download QR pack (all QR codes + quest images as a zip)">
            <QrCode className="w-4 h-4" />
          </button>
          <button onClick={() => fileInputRef.current?.click()} className="p-2 bg-white border border-neutral-200 text-neutral-600 rounded-md shadow-sm hover:bg-neutral-50 hover:text-indigo-600 transition-colors" title="Upload JSON">
            <Upload className="w-4 h-4" />
          </button>
          <button onClick={handleDelete} className="p-2 bg-white border border-neutral-200 text-neutral-600 rounded-md shadow-sm hover:bg-neutral-50 hover:text-red-600 transition-colors" title={gameId ? 'Delete Game' : 'Clear builder'}>
            <Trash2 className="w-4 h-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadFile(f); e.target.value = ''; }}
          />
        </div>
        
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onReconnect={onReconnect}
          onReconnectEnd={onReconnectEnd}
          onSelectionChange={onSelectionChange}
          onPaneClick={onPaneClick}
          deleteKeyCode={['Backspace', 'Delete']}
          fitView
          className="bg-neutral-50"
        >
          <Background gap={16} color="#e5e5e5" />
          <Controls className="bg-white border border-neutral-200 shadow-sm rounded-md" />
        </ReactFlow>
      </div>
    </div>
  );
}
