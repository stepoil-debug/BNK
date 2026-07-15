import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, LockKeyhole, RefreshCw, ShieldCheck, UserRoundCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

type Pose = 'center' | 'left' | 'right';
type CapturedSample = {
  pose: Pose;
  data_base64: string;
  mime_type: 'image/jpeg';
  width: number;
  height: number;
  quality_score: number;
  captured_at: string;
  preview: string;
};

type EnrollmentChallenge = {
  poses: Pose[];
  instructions: Record<Pose, string>;
  nonce: string;
};

const fallbackChallenge: EnrollmentChallenge = {
  poses: ['center', 'left', 'right'],
  instructions: {
    center: 'Olhe diretamente para a câmera',
    left: 'Vire lentamente o rosto para a esquerda',
    right: 'Vire lentamente o rosto para a direita'
  },
  nonce: ''
};

function estimateImageQuality(context: CanvasRenderingContext2D, width: number, height: number) {
  const sampleWidth = Math.min(width, 160);
  const sampleHeight = Math.min(height, 120);
  const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
  let brightness = 0;
  let contrastAccumulator = 0;
  const luminance: number[] = [];

  for (let index = 0; index < pixels.length; index += 16) {
    const value = pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114;
    luminance.push(value);
    brightness += value;
  }

  const average = brightness / Math.max(1, luminance.length);
  for (const value of luminance) contrastAccumulator += Math.abs(value - average);
  const contrast = contrastAccumulator / Math.max(1, luminance.length);
  const lightScore = 1 - Math.min(1, Math.abs(135 - average) / 135);
  const contrastScore = Math.min(1, contrast / 45);
  return Math.max(0.35, Math.min(1, lightScore * 0.65 + contrastScore * 0.35));
}

export function FaceEnrollment() {
  const navigate = useNavigate();
  const { access, refreshAuthState } = useAuth();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [challenge, setChallenge] = useState<EnrollmentChallenge>(fallbackChallenge);
  const [sessionId, setSessionId] = useState('');
  const [samples, setSamples] = useState<CapturedSample[]>([]);
  const [consent, setConsent] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const currentPose = challenge.poses[samples.length] ?? null;

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraReady(false);
  }, []);

  const startEnrollment = useCallback(async () => {
    setLoading(true);
    setError('');
    setSamples([]);

    try {
      stopCamera();
      const { data, error: functionError } = await supabase.functions.invoke('finance-biometric', {
        body: { action: 'begin_enrollment' }
      });
      if (functionError) throw functionError;

      const payload = data as { session_id?: string; challenge?: EnrollmentChallenge; message?: string };
      if (!payload.session_id) throw new Error(payload.message || 'Não foi possível iniciar o cadastro facial.');
      setSessionId(payload.session_id);
      setChallenge(payload.challenge ?? fallbackChallenge);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 }
        },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraReady(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível acessar a câmera.');
    } finally {
      setLoading(false);
    }
  }, [stopCamera]);

  useEffect(() => {
    void startEnrollment();
    return stopCamera;
  }, [startEnrollment, stopCamera]);

  function capture() {
    const video = videoRef.current;
    if (!video || !cameraReady || !currentPose) return;

    const width = Math.max(640, video.videoWidth || 640);
    const height = Math.max(480, video.videoHeight || 480);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      setError('O navegador não permitiu processar a captura facial.');
      return;
    }

    context.translate(width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0, width, height);
    context.setTransform(1, 0, 0, 1, 0, 0);

    const quality = estimateImageQuality(context, width, height);
    if (quality < 0.52) {
      setError('A iluminação ou nitidez está baixa. Ajuste o ambiente e tente novamente.');
      return;
    }

    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    setError('');
    setSamples((current) => [
      ...current,
      {
        pose: currentPose,
        data_base64: dataUrl,
        mime_type: 'image/jpeg',
        width,
        height,
        quality_score: quality,
        captured_at: new Date().toISOString(),
        preview: dataUrl
      }
    ]);
  }

  function resetLastCapture() {
    setSamples((current) => current.slice(0, -1));
    setError('');
  }

  async function completeEnrollment() {
    if (!consent) {
      setError('É necessário confirmar o consentimento para cadastrar a biometria facial.');
      return;
    }
    if (!sessionId || samples.length < 3) {
      setError('Conclua as três capturas solicitadas.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const averageQuality = samples.reduce((total, sample) => total + sample.quality_score, 0) / samples.length;
      const { data, error: functionError } = await supabase.functions.invoke('finance-biometric', {
        body: {
          action: 'complete_enrollment',
          session_id: sessionId,
          consent: true,
          consent_version: 'finance-biometric-v1',
          samples: samples.map(({ preview: _preview, ...sample }) => sample),
          descriptor: null,
          model_provider: 'step-guided-face-capture',
          model_version: 'capture-v1',
          quality_score: averageQuality,
          liveness_method: 'guided-random-pose-sequence',
          provider_payload: {
            source: 'bnk-first-login',
            planned_model_adapter: 'apontamento-step'
          }
        }
      });
      if (functionError) throw functionError;
      const payload = data as { enrolled?: boolean; message?: string };
      if (!payload.enrolled) throw new Error(payload.message || 'O cadastro facial não foi concluído.');

      stopCamera();
      await refreshAuthState();
      navigate('/security/device-check', { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível concluir o cadastro facial.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="face-enrollment-page">
      <section className="face-enrollment-card">
        <header className="face-enrollment-head">
          <div className="setup-icon"><UserRoundCheck size={34} /></div>
          <div>
            <span className="eyebrow">Primeiro acesso financeiro</span>
            <h1>Cadastro facial obrigatório</h1>
            <p>As imagens e os registros biométricos são armazenados exclusivamente no Supabase BNK, em bucket privado.</p>
          </div>
        </header>

        <div className="face-enrollment-layout">
          <div className="camera-stage">
            <video ref={videoRef} playsInline muted className="face-video" />
            <div className="face-guide" aria-hidden="true" />
            <div className="camera-instruction">
              {loading ? 'Preparando câmera...' : currentPose ? challenge.instructions[currentPose] : 'Capturas concluídas'}
            </div>
          </div>

          <aside className="face-capture-panel">
            <div className="security-summary">
              <span><ShieldCheck size={17} /> Referências em bucket privado</span>
              <span><LockKeyhole size={17} /> Hash individual de cada captura</span>
              <span><Camera size={17} /> Sequência aleatória de posições</span>
            </div>

            <div className="face-capture-list">
              {challenge.poses.map((pose, index) => {
                const sample = samples[index];
                return (
                  <article key={`${pose}-${index}`} className={`face-capture-item ${sample ? 'done' : currentPose === pose ? 'current' : ''}`}>
                    {sample ? <img src={sample.preview} alt={`Captura ${pose}`} /> : <span>{index + 1}</span>}
                    <div>
                      <strong>{challenge.instructions[pose]}</strong>
                      <small>{sample ? 'Captura protegida e pronta' : currentPose === pose ? 'Etapa atual' : 'Aguardando'}</small>
                    </div>
                    {sample ? <CheckCircle2 size={20} /> : null}
                  </article>
                );
              })}
            </div>

            {error ? <div className="error-box">{error}</div> : null}

            {currentPose ? (
              <button className="primary-btn" type="button" onClick={capture} disabled={!cameraReady || loading}>
                <Camera size={18} /> Capturar esta posição
              </button>
            ) : null}

            {samples.length > 0 ? (
              <button className="secondary-btn" type="button" onClick={resetLastCapture} disabled={submitting}>
                <RefreshCw size={17} /> Refazer última captura
              </button>
            ) : null}

            <label className="biometric-consent">
              <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
              <span>Autorizo o armazenamento protegido das minhas referências faciais no ambiente financeiro BNK para controle de acesso e auditoria.</span>
            </label>

            <button
              className="primary-btn"
              type="button"
              onClick={() => void completeEnrollment()}
              disabled={samples.length < 3 || !consent || submitting}
            >
              <UserRoundCheck size={18} /> {submitting ? 'Protegendo cadastro...' : 'Concluir cadastro facial'}
            </button>

            <button className="text-link-button" type="button" onClick={() => void startEnrollment()} disabled={submitting}>
              Reiniciar processo
            </button>
          </aside>
        </div>

        <footer className="face-enrollment-footer">
          Usuário financeiro: <strong>{access?.corporate_email || 'identidade protegida'}</strong>. O acesso aos dados financeiros permanece bloqueado até a conclusão desta etapa.
        </footer>
      </section>
    </div>
  );
}
