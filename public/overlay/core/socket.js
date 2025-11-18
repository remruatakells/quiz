const socket = io({ auth: {} });

socket.on("state", (state) => {
  window.lastState = state; // store latest

  window.overlayTimer.update(state.secondsLeft, state.secondsTotal);

  if (!window.currentRoundType || window.currentRoundType !== state.roundType) {
    window.currentRoundType = state.roundType;
    overlayDOM.clear();
    overlayDOM.loadView(state.roundType);
  } else if (window.currentRoundRenderer) {
    window.currentRoundRenderer(state);
  }
});
