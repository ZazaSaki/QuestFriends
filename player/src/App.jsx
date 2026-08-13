import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import Layout from './components/Layout';
import MissionCamera from './components/MissionCamera';
import WaitingRoom from './screens/WaitingRoom';
import MissionScreen from './screens/MissionScreen';
import QuestAccess from './screens/QuestAccess';
import GameConclusion from './screens/GameConclusion';
import CompassOverlay from './overlays/CompassOverlay';
import LeaderboardOverlay from './overlays/LeaderboardOverlay';

import { useGeolocation } from './hooks/useGeolocation';
import { connectPlayer } from './lib/socket';
import { loadSession, saveSession, clearSession } from './lib/session';
import { haversineMeters } from './lib/geo';
import * as api from './lib/api';

/**
 * The player app's single source of truth.
 *
 * Two state axes, matching the backend's own model:
 *   phase            JOIN → LOBBY → PLAYING → CONCLUSION
 *   currentQuestState  LOCKED → ACCESS → ACTIVE → SUBMITTED → REWARD → (LOCKED)
 *
 * Everything that talks to the backend lives here; the screens below are
 * presentational and driven by props, so a screen can be exercised on its own.
 * See scavenger/docs/frontend-guide.md for the loop this mirrors.
 */
/**
 * Rooms are addressed by UUID, so nobody should have to type one: a join link
 * or QR of the form `https://host/?room=391ee1a1-…` prefills the field.
 */
function roomIdFromUrl() {
  try {
    return new URLSearchParams(window.location.search).get('room')?.trim() ?? '';
  } catch {
    return '';
  }
}

export default function App() {
  const [session, setSession] = useState(() => loadSession());
  const [initialRoomId] = useState(roomIdFromUrl);
  const [phase, setPhase] = useState(session ? 'RESUMING' : 'JOIN');
  const [currentQuestState, setCurrentQuestState] = useState('LOCKED');

  const [target, setTarget] = useState(null); // { latitude, longitude, radius, sequenceOrder, openChallengeType }
  const [quest, setQuest] = useState(null); // { questId, title, challengeType, content, sequenceOrder }
  const [reward, setReward] = useState(null); // { awardedScore, postChallengeContent, totalScore }
  const [insideRadius, setInsideRadius] = useState(false);

  const [tab, setTab] = useState('mission'); // mission | compass | leaderboard
  const [cameraOpen, setCameraOpen] = useState(false);

  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const [teams, setTeams] = useState([]);
  const [boardLoading, setBoardLoading] = useState(false);
  const [finalScore, setFinalScore] = useState(null);
  const [conclusion, setConclusion] = useState(null);

  const socketRef = useRef(null);
  // Socket handlers are registered once but need the live session/quest, so
  // read them through refs rather than re-subscribing on every change.
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const questRef = useRef(quest);
  questRef.current = quest;

  // ---------------------------------------------------------------- game loop

  const renderActiveQuest = useCallback((q) => {
    setQuest(q);
    setReward(null);
    setError(null);
    setCurrentQuestState('ACTIVE');
    setCameraOpen(false);
    setTab('mission');
  }, []);

  const showConclusion = useCallback(async (sess) => {
    setPhase('CONCLUSION');
    setQuest(null);
    setTarget(null);
    try {
      const state = await api.getCurrentState(sess.userId);
      setFinalScore(state?.team?.totalScore ?? null);
    } catch {
      /* score is a nicety — the conclusion still renders without it */
    }
    try {
      const room = await api.getRoom(sess.roomId);
      if (room?.gameId) {
        const game = await api.getGame(room.gameId);
        setConclusion(game?.conclusion ?? null);
      }
    } catch {
      /* authored conclusion is optional */
    }
  }, []);

  const loadNextCoordinate = useCallback(
    async (sess) => {
      setQuest(null);
      setReward(null);
      setInsideRadius(false);
      setError(null);
      setCurrentQuestState('LOCKED');
      try {
        const next = await api.getNextCoordinate(sess.teamId);
        if (next?.finished) {
          await showConclusion(sess);
          return;
        }
        setTarget(next);
      } catch (err) {
        setError(err.message || 'Erro a obter o próximo waypoint.');
      }
    },
    [showConclusion]
  );

  const startGame = useCallback(
    async (sess) => {
      setPhase('PLAYING');
      // Recovery after a refresh: if the team already has a quest open, re-ask
      // for it (unlock-quest is idempotent) instead of restarting the waypoint.
      try {
        const state = await api.getCurrentState(sess.userId);
        if (state?.activeQuestId) {
          const q = await api.unlockQuest(sess.teamId);
          if (!q?.finished) {
            renderActiveQuest(q);
            return;
          }
        }
      } catch {
        /* fall through to the normal waypoint flow */
      }
      await loadNextCoordinate(sess);
    },
    [loadNextCoordinate, renderActiveQuest]
  );

  const handleValidation = useCallback(
    (p) => {
      setBusy(false);
      setCameraOpen(false);
      if (p.status === 'APPROVED') {
        setReward({
          awardedScore: p.awardedScore,
          postChallengeContent: p.postChallengeContent,
          totalScore: p.totalScore,
        });
        setError(null);
        setCurrentQuestState('REWARD');
        setTab('mission');
      } else {
        // The quest stays active server-side, so drop back to it for a retry.
        setError(p.message || 'A staff pediu para tentarem outra vez.');
        setCurrentQuestState(questRef.current ? 'ACTIVE' : 'LOCKED');
      }
    },
    []
  );

  // ------------------------------------------------------------- join / lobby

  const handleJoin = useCallback(
    async (roomId, username) => {
      setBusy(true);
      setError(null);
      try {
        const res = await api.joinPlayer(roomId, username);
        const next = {
          userId: res.user.id,
          teamId: res.team.id,
          teamName: res.team.name,
          roomId,
          username,
        };
        saveSession(next);
        setSession(next);
        setPhase('RESUMING');
      } catch (err) {
        setError(err.message || 'Não foi possível entrar na sala.');
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const handleLeave = useCallback(() => {
    if (!window.confirm('Sair da sala neste telemóvel?')) return;
    clearSession();
    socketRef.current?.disconnect();
    socketRef.current = null;
    window.location.reload();
  }, []);

  // Once a session exists (fresh join or restored from localStorage), find out
  // whether the room is already playing and enter the right screen.
  useEffect(() => {
    if (!session || phase !== 'RESUMING') return;
    let cancelled = false;
    (async () => {
      try {
        const room = await api.getRoom(session.roomId);
        if (cancelled) return;
        if (room?.status === 'PLAYING') await startGame(session);
        else if (room?.status === 'FINISHED') await showConclusion(session);
        else setPhase('LOBBY');
      } catch (err) {
        if (cancelled) return;
        // A stale session (room deleted) must not trap the player on a dead screen.
        setError(err.message || 'A sala já não existe.');
        clearSession();
        setSession(null);
        setPhase('JOIN');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, phase, startGame, showConclusion]);

  // ------------------------------------------------------------------ sockets

  useEffect(() => {
    if (!session) return undefined;

    const socket = connectPlayer({ roomId: session.roomId, teamId: session.teamId });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('game_started', () => {
      setNotice('O jogo começou!');
      startGame(sessionRef.current);
    });

    socket.on('quest_unlocked', (p) => {
      // A teammate may have opened it — the quest belongs to the whole team.
      if (p.teamId === sessionRef.current?.teamId) renderActiveQuest(p);
    });

    socket.on('at_location', (p) => {
      if (!p || p.teamId === sessionRef.current?.teamId) setInsideRadius(true);
    });

    socket.on('validation_result', (p) => {
      if (p.teamId === sessionRef.current?.teamId) handleValidation(p);
    });

    socket.on('room_closed', (p) => {
      setNotice(
        p?.reason === 'ended' ? 'O anfitrião terminou o jogo.' : 'A sala foi encerrada.'
      );
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [session, startGame, renderActiveQuest, handleValidation]);

  // -------------------------------------------------------------- geolocation

  // GPS runs while hunting a waypoint (or while the compass is open) and is
  // released once the quest is open — no reason to burn battery mid-reading.
  const trackingActive =
    phase === 'PLAYING' &&
    (tab === 'compass' || currentQuestState === 'LOCKED' || currentQuestState === 'ACCESS');

  const { coords, error: geoError } = useGeolocation(trackingActive);

  const distance = useMemo(() => {
    if (!coords || !target) return null;
    return haversineMeters(coords.latitude, coords.longitude, target.latitude, target.longitude);
  }, [coords, target]);

  useEffect(() => {
    if (!coords || !session) return;
    const socket = socketRef.current;
    if (socket?.connected) {
      socket.emit('player_location_update', {
        userId: session.userId,
        teamId: session.teamId,
        lat: coords.latitude,
        lng: coords.longitude,
      });
    }
    // Local fallback for the server's `at_location` — the unlock button should
    // not depend on a socket round-trip when the player is clearly there.
    if (target && distance != null && distance <= target.radius) setInsideRadius(true);
  }, [coords, session, target, distance]);

  // -------------------------------------------------------------- interaction

  const openQuest = useCallback(async () => {
    if (!session || !target) return;
    if (target.openChallengeType !== 'NONE') {
      setCurrentQuestState('ACCESS');
      setError(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const q = await api.unlockQuest(session.teamId);
      if (q?.finished) await showConclusion(session);
      else renderActiveQuest(q);
    } catch (err) {
      setError(err.message || 'Erro a abrir a missão.');
    } finally {
      setBusy(false);
    }
  }, [session, target, renderActiveQuest, showConclusion]);

  const unlockWithValue = useCallback(
    async (value) => {
      if (!session) return;
      setBusy(true);
      setError(null);
      try {
        const q = await api.unlockQuest(session.teamId, value);
        if (q?.finished) await showConclusion(session);
        else renderActiveQuest(q);
      } catch (err) {
        if (err.status === 403) setError('Código errado. Tentem outra vez.');
        else if (err.status === 409) setError('A equipa já tem outra missão aberta.');
        else setError(err.message || 'Erro a abrir a missão.');
      } finally {
        setBusy(false);
      }
    },
    [session, renderActiveQuest, showConclusion]
  );

  const submitQuiz = useCallback(
    async (answer) => {
      if (!session) return;
      setBusy(true);
      setError(null);
      try {
        const res = await api.submitAnswer(session.teamId, answer);
        if (res?.result === 'INCORRECT') {
          setError('Resposta errada — o quiz recomeça do início.');
          setBusy(false);
          return;
        }
        if (res?.result === 'CORRECT') {
          // Normally `validation_result` lands first; cover the socket being down.
          if (!socketRef.current?.connected) {
            setReward({ awardedScore: null, postChallengeContent: null });
            setCurrentQuestState('REWARD');
          }
          setBusy(false);
          return;
        }
        // No answer key on this quest → it went to staff for manual review.
        setCurrentQuestState('SUBMITTED');
        setBusy(false);
      } catch (err) {
        setError(err.message || 'Erro a submeter a resposta.');
        setBusy(false);
      }
    },
    [session]
  );

  const submitMedia = useCallback(
    async (file) => {
      if (!session) return;
      setBusy(true);
      setError(null);
      try {
        const url = await api.uploadMedia(session.teamId, file);
        await api.submitAnswer(session.teamId, url);
        setCameraOpen(false);
        setCurrentQuestState('SUBMITTED');
      } catch (err) {
        setError(err.message || 'Erro no envio do ficheiro.');
      } finally {
        setBusy(false);
      }
    },
    [session]
  );

  const continueToNext = useCallback(() => {
    if (session) loadNextCoordinate(session);
  }, [session, loadNextCoordinate]);

  // Standings are polled on demand — one fetch each time the board is opened.
  useEffect(() => {
    if (tab !== 'leaderboard' || !session) return;
    let cancelled = false;
    setBoardLoading(true);
    api
      .getRoom(session.roomId)
      .then((room) => !cancelled && setTeams(room?.teams ?? []))
      .catch(() => !cancelled && setTeams([]))
      .finally(() => !cancelled && setBoardLoading(false));
    return () => {
      cancelled = true;
    };
  }, [tab, session]);

  // Auto-dismiss transient banners.
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  // ------------------------------------------------------------------ render

  const showNav = phase === 'PLAYING' || phase === 'CONCLUSION';

  return (
    <Layout
      activeTab={tab}
      onTabChange={setTab}
      showNav={showNav}
      connected={connected}
      teamName={session?.teamName}
      onAccount={session ? handleLeave : undefined}
    >
      {(phase === 'JOIN' || phase === 'LOBBY' || phase === 'RESUMING') && (
        <WaitingRoom
          joined={phase !== 'JOIN'}
          teamName={session?.teamName}
          username={session?.username}
          onJoin={handleJoin}
          busy={busy}
          error={error}
          initialRoomId={initialRoomId}
        />
      )}

      {phase === 'PLAYING' && (
        <MissionScreen
          questState={currentQuestState}
          quest={quest}
          target={target}
          distance={distance}
          insideRadius={insideRadius}
          geoError={geoError}
          reward={reward}
          onOpenQuest={openQuest}
          onOpenCamera={() => setCameraOpen(true)}
          onSubmitQuiz={submitQuiz}
          onContinue={continueToNext}
          onOpenCompass={() => setTab('compass')}
          busy={busy}
          error={error}
          notice={notice}
        />
      )}

      {phase === 'CONCLUSION' && (
        <GameConclusion
          teamName={session?.teamName}
          totalScore={finalScore}
          conclusion={conclusion}
          onOpenLeaderboard={() => setTab('leaderboard')}
        />
      )}

      {/* Overlays sit above the screen but below the floating pill nav. */}
      {tab === 'compass' && (
        <CompassOverlay
          coords={coords}
          target={target}
          distance={distance}
          geoError={geoError}
          onClose={() => setTab('mission')}
        />
      )}

      {tab === 'leaderboard' && (
        <LeaderboardOverlay
          teams={teams}
          myTeamId={session?.teamId}
          loading={boardLoading}
          onClose={() => setTab('mission')}
        />
      )}

      {/* Full-screen takeovers */}
      {currentQuestState === 'ACCESS' && target && (
        <QuestAccess
          mode={target.openChallengeType}
          sequenceOrder={target.sequenceOrder}
          onUnlock={unlockWithValue}
          onBack={() => {
            setError(null);
            setCurrentQuestState('LOCKED');
          }}
          busy={busy}
          error={error}
        />
      )}

      {cameraOpen && quest && (
        <MissionCamera
          challengeType={quest.challengeType}
          onSubmit={submitMedia}
          onCancel={() => setCameraOpen(false)}
          busy={busy}
          error={error}
        />
      )}
    </Layout>
  );
}
