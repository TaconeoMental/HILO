import { useReducer } from "react";

const initialState = {
  status: "stopped",
  error: null
};

function reducer(state, action) {
  switch (action.type) {
    case "START_REQUEST":
      return { ...state, error: null };
    case "START_SUCCESS":
      return { status: "recording", error: null };
    case "START_FAILURE":
      return { ...state, error: action.error || "Error" };
    case "PAUSE":
      return { ...state, status: "paused" };
    case "RESUME":
      return { ...state, status: "recording" };
    case "STOP_SUCCESS":
      return { status: "stopped", error: null };
    case "STOP_FAILURE":
      return { ...state, error: action.error || "Error" };
    case "SET_ERROR":
      return { ...state, error: action.error };
    default:
      return state;
  }
}

export function useRecorderReducer() {
  return useReducer(reducer, initialState);
}
