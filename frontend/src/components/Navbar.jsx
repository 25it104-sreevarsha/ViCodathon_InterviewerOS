function Navbar({ onStart }) {
  return (
    <nav className="navbar">
      <button className="brand-button" onClick={() => window.location.reload()}>
        <span className="brand-mark">IO</span>
        <strong>INTERVIEWER OS</strong>
      </button>

      <button className="nav-button" onClick={onStart}>
        Start Interview →
      </button>
    </nav>
  );
}

export default Navbar;