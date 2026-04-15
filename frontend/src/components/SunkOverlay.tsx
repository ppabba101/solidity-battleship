import { AnimatePresence, motion } from "framer-motion";

interface SunkOverlayProps {
  shipName: string | null;
}

// Center-screen 2s announcement that fires every time a ship is sunk.
export function SunkOverlay({ shipName }: SunkOverlayProps) {
  return (
    <AnimatePresence>
      {shipName && (
        <motion.div
          key={shipName + Date.now()}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.2 }}
          transition={{ duration: 0.35 }}
          className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
        >
          <div className="px-10 py-6 rounded-2xl bg-black/70 border-2 border-orange shadow-[0_0_60px_rgba(249,115,22,0.6)]">
            <div className="text-[48px] font-extrabold tracking-wide text-orange uppercase text-center">
              {shipName} Sunk!
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
