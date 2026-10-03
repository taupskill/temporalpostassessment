const loginForm = document.querySelector("#staff-login");
const loginError = document.querySelector("#login-error");

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = loginForm.querySelector("button");
  button.disabled = true;
  loginError.hidden = true;
  const response = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(Object.fromEntries(new FormData(loginForm))),
  });
  if (response.ok) {
    location.href = "/staff.html";
    return;
  }
  const body = await response.json().catch(() => ({}));
  loginError.textContent = body.error ?? "Sign-in failed. Please try again.";
  loginError.hidden = false;
  button.disabled = false;
});
