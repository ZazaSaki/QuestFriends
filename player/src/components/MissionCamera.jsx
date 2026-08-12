import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon';

/**
 * Converted from baseline/stitch_quest_expedition_ui/mission_camera.
 *
 * The mock draws a live viewfinder, but a web app gets a better capture from
 * the OS: `<input type="file" accept="image/*,video/*" capture="environment">`
 * opens the phone's own camera (with its stabilisation, flash and HDR), and
 * hands back the file. So the shutter button fires that input, and the
 * viewfinder area becomes the review pane for what was just captured.
 *
 * On desktop the same input degrades to a file picker, which is what QA wants.
 */
export default function MissionCamera({ challengeType, onSubmit, onCancel, busy, error }) {
  const videoOnly = challengeType === 'VIDEO';
  const [mode, setMode] = useState(videoOnly ? 'VIDEO' : 'PHOTO');
  const [file, setFile] = useState(null);
  const inputRef = useRef(null);

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => previewUrl && URL.revokeObjectURL(previewUrl), [previewUrl]);

  const isVideoFile = file?.type?.startsWith('video/');

  return (
    <div className="fixed inset-0 z-[60] bg-black text-on-primary overflow-hidden">
      {/* Viewfinder / review pane */}
      <div className="camera-bg">
        {previewUrl &&
          (isVideoFile ? (
            <video src={previewUrl} controls playsInline className="w-full h-full object-contain" />
          ) : (
            <img src={previewUrl} alt="Your capture" className="w-full h-full object-contain" />
          ))}
      </div>

      <div className="ui-layer">
        {/* Top controls */}
        <div className="flex items-center justify-between px-container-margin py-stack-md pt-12">
          <button
            type="button"
            aria-label="Cancel"
            onClick={onCancel}
            className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-on-primary hover:bg-black/60 transition-colors"
          >
            <Icon name="close" fill />
          </button>
          <span className="font-label-sm text-label-sm uppercase tracking-widest text-on-primary/80 drop-shadow-md">
            {file ? 'Review' : `Capture ${mode.toLowerCase()}`}
          </span>
          <div className="w-12 h-12" />
        </div>

        {/* Target reticle (decorative, hidden once there is a capture to review) */}
        {!file && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-30">
            <div className="w-64 h-64 border border-on-primary rounded-3xl opacity-50" />
            <div className="absolute w-2 h-2 bg-on-primary rounded-full" />
          </div>
        )}

        {/* Bottom controls */}
        <div className="pb-12 pt-8 px-container-margin bg-gradient-to-t from-black/80 via-black/40 to-transparent flex flex-col items-center">
          {error && (
            <p className="font-label-md text-label-md text-error-container mb-4 text-center drop-shadow-md">
              {error}
            </p>
          )}

          {!videoOnly && (
            <div className="flex gap-8 mb-8 font-label-md text-label-md">
              {['PHOTO', 'VIDEO'].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={
                    mode === m
                      ? 'text-secondary-container drop-shadow-md'
                      : 'text-on-primary/60 hover:text-on-primary drop-shadow-md transition-colors'
                  }
                >
                  {m}
                </button>
              ))}
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept={mode === 'VIDEO' ? 'video/*' : 'image/*'}
            capture="environment"
            className="sr-only"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />

          <div className="flex items-center justify-between w-full max-w-sm">
            {/* Retake / gallery slot */}
            <button
              type="button"
              aria-label={file ? 'Discard capture' : 'Choose from gallery'}
              onClick={() => {
                setFile(null);
                if (inputRef.current) inputRef.current.value = '';
                if (!file) inputRef.current?.click();
              }}
              className="w-14 h-14 rounded-xl border border-on-primary/30 overflow-hidden bg-surface-container-low/20 backdrop-blur-sm flex items-center justify-center"
            >
              {file && !isVideoFile ? (
                <img src={previewUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <Icon name={file ? 'replay' : 'photo_library'} className="text-on-primary" />
              )}
            </button>

            {/* Shutter → native camera, or submit once something is captured */}
            {file ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => onSubmit(file)}
                className="h-20 px-8 rounded-full bg-secondary-container text-on-secondary-container font-label-md text-label-md uppercase flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform disabled:opacity-50"
              >
                <Icon name="send" fill />
                {busy ? 'Sending…' : 'Submit'}
              </button>
            ) : (
              <button
                type="button"
                aria-label="Open camera"
                onClick={() => inputRef.current?.click()}
                className="w-20 h-20 rounded-full border-4 border-on-primary flex items-center justify-center active:scale-95 transition-transform"
              >
                <div className="w-16 h-16 rounded-full bg-on-primary" />
              </button>
            )}

            {/* Switch camera is the OS camera's job now — keep the slot for
                layout symmetry and use it to re-open the picker. */}
            <button
              type="button"
              aria-label="Retake"
              onClick={() => {
                setFile(null);
                if (inputRef.current) inputRef.current.value = '';
                inputRef.current?.click();
              }}
              className="w-14 h-14 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-on-primary hover:bg-black/60 transition-colors"
            >
              <Icon name="flip_camera_ios" fill />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
