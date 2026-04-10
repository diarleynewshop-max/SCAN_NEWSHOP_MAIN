import React from "react";

const TutorialButton: React.FC = () => {
  const openTour = () => {
    // Trigger the tour to open in this tab
    const ev = new CustomEvent("start-tour");
    window.dispatchEvent(ev);
    // Also set localStorage trigger compatibility (for older listeners)
    localStorage.setItem("start_tour", "1");
    // Clean up immediately to avoid repeated openings on storage event in other tabs
    setTimeout(() => localStorage.removeItem("start_tour"), 100);
  };

  return (
    <button
      onClick={openTour}
      aria-label="Iniciar Tutorial"
      title="Iniciar Tutorial"
      style={{
        padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)",
        background: "var(--card)", color: "var(--foreground)", cursor: "pointer",
        display: "flex", alignItems: "center", gap: 8,
        boxShadow: "var(--shadow-sm)"
      }}
    >
      🧭 Tutorial
    </button>
  );
};

export default TutorialButton;
