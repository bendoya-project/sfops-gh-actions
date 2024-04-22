"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Status = exports.Conclusion = void 0;
var Conclusion;
(function (Conclusion) {
    Conclusion["Success"] = "success";
    Conclusion["Failure"] = "failure";
    Conclusion["Neutral"] = "neutral";
    Conclusion["Cancelled"] = "cancelled";
    Conclusion["TimedOut"] = "timed_out";
    Conclusion["ActionRequired"] = "action_required";
    Conclusion["Skipped"] = "skipped";
})(Conclusion || (exports.Conclusion = Conclusion = {}));
var Status;
(function (Status) {
    Status["Queued"] = "queued";
    Status["InProgress"] = "in_progress";
    Status["Completed"] = "completed";
})(Status || (exports.Status = Status = {}));
