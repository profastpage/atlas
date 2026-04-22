'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Download, HelpCircle, CheckCircle2, MessageCircle, Sparkles, ChevronRight, ArrowLeft
} from 'lucide-react';

// ========================================
// QR PAYMENT MODAL — Yape/Plin Payment Flow
// Shows QR for plan payment, guide, download, WhatsApp support
// ========================================

const WHATSAPP_NUMBER = '51933667414';
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}`;

interface QRPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  planName: string;
  planPrice: number;
  planFeatures: string[];
}

type PaymentStep = 'qr' | 'success' | 'guide';

export default function QRPaymentModal({
  isOpen,
  onClose,
  planName,
  planPrice,
  planFeatures,
}: QRPaymentModalProps) {
  const [step, setStep] = useState<PaymentStep>('qr');
  const [guideStep, setGuideStep] = useState(0);

  // Reset step when modal opens with new plan
  const handleClose = () => {
    setStep('qr');
    setGuideStep(0);
    onClose();
  };

  const handleDownloadQR = () => {
    const link = document.createElement('a');
    link.href = '/qr-yape.png';
    link.download = `qr-yape-atlas-${planName.toLowerCase()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleConfirmPayment = () => {
    setStep('success');
  };

  const openWhatsApp = (message: string) => {
    const encoded = encodeURIComponent(message);
    window.open(`${WHATSAPP_URL}?text=${encoded}`, '_blank');
  };

  const PLAN_COLORS: Record<string, { bg: string; border: string; text: string; accent: string }> = {
    basico: { bg: 'from-emerald-500/10 to-emerald-600/5', border: 'border-emerald-500/20', text: 'text-emerald-400', accent: '#059669' },
    pro: { bg: 'from-blue-500/10 to-blue-600/5', border: 'border-blue-500/20', text: 'text-blue-400', accent: '#3b82f6' },
    ejecutivo: { bg: 'from-amber-500/10 to-amber-600/5', border: 'border-amber-500/20', text: 'text-amber-400', accent: '#f59e0b' },
  };

  const colors = PLAN_COLORS[planName.toLowerCase()] || PLAN_COLORS.basico;

  const GUIDE_STEPS = [
    {
      title: 'Abre Yape o Plin',
      desc: 'Desliza hacia arriba o abre la aplicacion desde tu celular. Asegurate de tener saldo suficiente.',
      icon: '📱',
    },
    {
      title: 'Escanea el codigo QR',
      desc: 'Toca el icono de escanear en Yape/Plin y apunta la camara al codigo QR que aparece en pantalla.',
      icon: '📷',
    },
    {
      title: 'O descarga la imagen',
      desc: 'Si prefieres, toca "Descargar QR", luego ve a Yape > Pagos > Subir imagen y selecciona la foto descargada.',
      icon: '📥',
    },
    {
      title: 'Ingresa el monto exacto',
      desc: `Escribe el monto: S/ ${planPrice}. Verifica que el destinatario sea correcto antes de confirmar.`,
      icon: '✏️',
    },
    {
      title: 'Confirma el pago',
      desc: 'Revisa los datos y confirma la transferencia. Guarda el comprobante de pago.',
      icon: '✅',
    },
    {
      title: 'Envia comprobante por WhatsApp',
      desc: 'Toca el boton verde de WhatsApp y envia tu comprobante. Activaremos tu plan de inmediato.',
      icon: '💬',
    },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[90]"
            onClick={handleClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-x-4 top-[5%] sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-[420px] bg-gray-900 rounded-2xl shadow-2xl border border-gray-700/40 z-[95] overflow-hidden"
          >
            {/* ===== SUCCESS STEP ===== */}
            {step === 'success' && (
              <div className="p-6 text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', damping: 15, stiffness: 200, delay: 0.1 }}
                  className="w-20 h-20 rounded-full bg-emerald-500/15 border-2 border-emerald-500/30 flex items-center justify-center mx-auto mb-5"
                >
                  <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <h2 className="text-xl font-bold text-white mb-2">
                    Felicidades por tu suscripcion
                  </h2>
                  <p className="text-sm text-gray-400 leading-relaxed mb-1">
                    Tu <span className={`font-semibold ${colors.text}`}>Plan {planName}</span> sera activado a la brevedad.
                  </p>
                  <p className="text-xs text-gray-500 mb-6">
                    Recibiras confirmacion por WhatsApp una vez verificado el pago.
                  </p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="space-y-3"
                >
                  <button
                    onClick={() => openWhatsApp(
                      `Hola Atlas! Acabo de realizar el pago de S/ ${planPrice} por el Plan ${planName}. Adjunto mi comprobante para la activacion del servicio.`
                    )}
                    className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-all active:scale-[0.97] flex items-center justify-center gap-2"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Enviar comprobante por WhatsApp
                  </button>
                  <button
                    onClick={handleClose}
                    className="w-full py-2.5 rounded-xl text-gray-400 hover:text-white text-sm transition-all"
                  >
                    Volver al chat
                  </button>
                </motion.div>
              </div>
            )}

            {/* ===== GUIDE STEP ===== */}
            {step === 'guide' && (
              <div className="p-5 max-h-[80vh] overflow-y-auto overscroll-contain">
                <div className="flex items-center justify-between mb-5">
                  <button
                    onClick={() => setStep('qr')}
                    className="p-1.5 rounded-lg hover:bg-gray-800/60 transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4 text-gray-400" />
                  </button>
                  <h2 className="text-base font-bold text-white">
                    Guia de pago con Yape/Plin
                  </h2>
                  <button
                    onClick={handleClose}
                    className="p-1.5 rounded-lg hover:bg-gray-800/60 transition-colors"
                  >
                    <X className="w-4 h-4 text-gray-400" />
                  </button>
                </div>

                <div className="space-y-3">
                  {GUIDE_STEPS.map((gs, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      onClick={() => setGuideStep(i)}
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                        guideStep === i
                          ? 'bg-emerald-500/10 border-emerald-500/30'
                          : 'bg-gray-800/30 border-gray-700/30 hover:bg-gray-800/50'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-lg shrink-0">{gs.icon}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded">
                              {i + 1}
                            </span>
                            <p className="text-sm font-semibold text-white">{gs.title}</p>
                          </div>
                          <p className="text-[12px] text-gray-400 mt-1 leading-relaxed">
                            {gs.desc}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* WhatsApp help at bottom */}
                <div className="mt-5 pt-4 border-t border-gray-800/40">
                  <button
                    onClick={() => openWhatsApp(
                      `Hola! Necesito ayuda con el pago del Plan ${planName} (S/ ${planPrice}). Como puedo realizar el pago con Yape o Plin?`
                    )}
                    className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-all active:scale-[0.97] flex items-center justify-center gap-2"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Necesito ayuda con el pago
                  </button>
                </div>
              </div>
            )}

            {/* ===== QR PAYMENT STEP (main) ===== */}
            {step === 'qr' && (
              <div className="p-5">
                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h2 className="text-lg font-bold text-white">Pagar Plan {planName}</h2>
                    <p className="text-xs text-gray-500 mt-0.5">Escanea o descarga el QR para pagar</p>
                  </div>
                  <button
                    onClick={handleClose}
                    className="p-2 rounded-xl hover:bg-gray-800/60 transition-colors"
                  >
                    <X className="w-5 h-5 text-gray-400" />
                  </button>
                </div>

                {/* Amount badge */}
                <div className={`mx-auto max-w-[200px] mb-4 px-5 py-3 rounded-xl bg-gradient-to-br ${colors.bg} border ${colors.border} text-center`}>
                  <p className="text-[11px] text-gray-400 uppercase tracking-wider font-medium">Monto a pagar</p>
                  <p className={`text-3xl font-black ${colors.text} mt-0.5`}>
                    S/ {planPrice}
                  </p>
                  <p className="text-[10px] text-gray-500">mensual</p>
                </div>

                {/* QR Code */}
                <div className="bg-white rounded-2xl p-3 mx-auto max-w-[220px] shadow-lg mb-4">
                  <img
                    src="/qr-yape-full.png"
                    alt="QR de pago Yape - Atlas Coach"
                    className="w-full h-auto rounded-xl"
                  />
                </div>

                {/* Yape info */}
                <div className="text-center mb-4">
                  <p className="text-xs text-gray-400">
                    Escanea con <span className="font-semibold text-emerald-400">Yape</span> o{' '}
                    <span className="font-semibold text-blue-400">Plin</span>
                  </p>
                  <p className="text-[10px] text-gray-600 mt-1">
                    Destinatario: Fabio Cesar Herrera Bonilla
                  </p>
                </div>

                {/* Action buttons */}
                <div className="space-y-2.5">
                  {/* Download QR */}
                  <button
                    onClick={handleDownloadQR}
                    className="w-full py-2.5 rounded-xl bg-gray-800/60 border border-gray-700/30 hover:bg-gray-800 text-sm text-white font-medium transition-all active:scale-[0.97] flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4 text-emerald-400" />
                    Descargar QR
                  </button>

                  {/* Confirm payment */}
                  <button
                    onClick={handleConfirmPayment}
                    className={`w-full py-3 rounded-xl bg-gradient-to-r ${planName.toLowerCase() === 'ejecutivo' ? 'from-amber-600 to-amber-500' : planName.toLowerCase() === 'pro' ? 'from-blue-600 to-blue-500' : 'from-emerald-600 to-emerald-500'} hover:opacity-90 text-white font-bold text-sm transition-all active:scale-[0.97] flex items-center justify-center gap-2 shadow-lg`}
                  >
                    <Sparkles className="w-4 h-4" />
                    Ya realice el pago
                  </button>

                  {/* Guide + Support row */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setStep('guide')}
                      className="flex-1 py-2.5 rounded-xl bg-gray-800/40 border border-gray-700/25 text-xs text-gray-300 hover:text-white hover:bg-gray-800/60 transition-all active:scale-[0.97] flex items-center justify-center gap-1.5"
                    >
                      <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
                      Guia de pago
                      <ChevronRight className="w-3 h-3 text-gray-600" />
                    </button>
                    <button
                      onClick={() => openWhatsApp(
                        `Hola Atlas! Necesito ayuda con el pago del Plan ${planName} (S/ ${planPrice}).`
                      )}
                      className="flex-1 py-2.5 rounded-xl bg-emerald-600/10 border border-emerald-500/20 text-xs text-emerald-400 hover:bg-emerald-600/20 transition-all active:scale-[0.97] flex items-center justify-center gap-1.5"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      Soporte WhatsApp
                    </button>
                  </div>
                </div>

                {/* Plan features reminder */}
                <div className="mt-4 p-3 rounded-xl bg-gray-800/30 border border-gray-700/20">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">
                    Incluido en tu Plan {planName}
                  </p>
                  <div className="space-y-1">
                    {planFeatures.map((feat) => (
                      <div key={feat} className="flex items-center gap-1.5">
                        <CheckCircle2 className={`w-3 h-3 ${colors.text} shrink-0`} />
                        <span className="text-[11px] text-gray-400">{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
