
import { useNavigate } from "react-router-dom";
import "../../assets/styles/RoleSelect.css";

function RoleSelect() {

  const navigate = useNavigate();

  return (

    <div className="role-container">

      {/* HEADER */}
      <div className="role-header">
        <img
          src="/images/image.png"
          alt="Scanigo Logo"
          className="role-logo-img"
        />

        <h1>Scanigo</h1>
      </div>

      {/* MESSAGE */}
      <div className="role-message">
        <h2>Choose a role</h2>
        <p>Tap a role to open its login</p>
      </div>

      {/* ROLE CARDS */}
      <div className="role-cards">

        {/* STUDENT */}
        <div
          className="role-card"
          onClick={() => navigate("/student-login")}
        >
          <img
            src="/images/image copy.png"
            alt="Student"
            className="role-card-img"
          />

          <span className="role-name">
            Student
          </span>
        </div>

        {/* ADMIN */}
        <div
          className="role-card"
          onClick={() => navigate("/admin-login")}
        >
          <img
            src="/images/image copy 2.png"
            alt="Admin"
            className="role-card-img"
          />

          <span className="role-name">
            Admin
          </span>
        </div>

        {/* DRIVER */}
        <div
          className="role-card"
          onClick={() => navigate("/driver-login")}
        >
          <img
            src="/images/image copy 3.png"
            alt="Driver"
            className="role-card-img"
          />

          <span className="role-name">
            Driver
          </span>
        </div>

      </div>

      {/* BOTTOM NAV */}
      <div className="role-bottom-nav">
        <span onClick={() => navigate("/student-login")} style={{ cursor: "pointer" }}>Student</span>
        <span onClick={() => navigate("/admin-login")} style={{ cursor: "pointer" }}>Admin</span>
        <span onClick={() => navigate("/driver-login")} style={{ cursor: "pointer" }}>Driver</span>
      </div>


    </div>
  );
}

export default RoleSelect;
