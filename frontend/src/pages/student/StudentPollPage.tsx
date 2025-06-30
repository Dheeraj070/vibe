import { useEffect, useState } from "react";
import io from "socket.io-client";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

const socket = io("http://localhost:3000"); // adjust if needed
const API_URL = import.meta.env.VITE_API_URL;

const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
});

type Poll = {
  id: string;
  question: string;
  options: string[];
  roomCode: string;
  creatorId: string;
  createdAt: string;
};

type RoomDetails = {
  code: string;
  creatorId: string;
  createdAt: string;
};

export default function StudentPollPage() {
  const [roomCode, setRoomCode] = useState("");
  const [joinedRoom, setJoinedRoom] = useState(false);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [roomDetails, setRoomDetails] = useState<RoomDetails | null>(null);
  const [answeredPolls, setAnsweredPolls] = useState<Record<string, number>>({});
  const [roomError, setRoomError] = useState<string | null>(null);
  const [activeMenu, setActiveMenu] = useState<"room" | "previous" | null>(null); // which side panel to show

  // Auto-rejoin if user refreshes
  useEffect(() => {
    const savedRoomCode = localStorage.getItem("activeRoomCode");
    const savedJoined = localStorage.getItem("joinedRoom");
    if (savedRoomCode && savedJoined === "true") {
      setRoomCode(savedRoomCode);
      setJoinedRoom(true);
      socket.emit("join-room", savedRoomCode);
      loadRoomDetails(savedRoomCode);
      const savedAnswers = localStorage.getItem(`answeredPolls_${savedRoomCode}`);
      if (savedAnswers) setAnsweredPolls(JSON.parse(savedAnswers));
    }
  }, []);

  useEffect(() => {
        socket.on("new-poll", (poll: Poll) => {
            setPolls(prev => [...prev, poll]);
            toast("New poll received!");
        });
        return () => { socket.off("new-poll"); };
    }, []);


  useEffect(() => {
    if (roomCode) {
      localStorage.setItem(`answeredPolls_${roomCode}`, JSON.stringify(answeredPolls));
    }
  }, [answeredPolls, roomCode]);

  const loadRoomDetails = async (code: string) => {
    try {
      const res = await api.get(`/livequizzes/rooms/${code}`);
      if (res.data) setRoomDetails(res.data);
    } catch (e) {
      console.error("Failed to load room details:", e);
    }
  };

  const joinRoom = async () => {
    setRoomError(null);
    try {
      const res = await api.get(`/livequizzes/rooms/${roomCode}`);
      if (res.data?.code) {
        socket.emit("join-room", roomCode);
        setJoinedRoom(true);
        setRoomDetails(res.data);
        localStorage.setItem("activeRoomCode", roomCode);
        localStorage.setItem("joinedRoom", "true");
        setPolls([]); // reset polls
        const savedAnswers = localStorage.getItem(`answeredPolls_${roomCode}`);
        setAnsweredPolls(savedAnswers ? JSON.parse(savedAnswers) : {});
        toast.success("Joined room!");
      } else {
        setRoomError("Invalid room code.");
      }
    } catch (error: any) {
      setRoomError(error.response?.status === 404 ? "Room not found." : "Unexpected error.");
    }
  };

  const submitAnswer = async (pollId: string, answerIndex: number) => {
    try {
      await api.post(`/livequizzes/rooms/${roomCode}/polls/answer`, {
        pollId, userId: "student-456", answerIndex
      });
      setAnsweredPolls(prev => ({ ...prev, [pollId]: answerIndex }));
      toast.success("Vote submitted!");
    } catch {
      toast.error("Failed to submit vote");
    }
  };

  const exitRoom = () => {
    socket.emit("leave-room", roomCode);
    setJoinedRoom(false);
    setPolls([]);
    setAnsweredPolls({});
    setRoomDetails(null);
    localStorage.removeItem("activeRoomCode");
    localStorage.removeItem("joinedRoom");
    setActiveMenu(null);
    toast.info("Left the room.");
  };

  return (
    <div className="max-w-6xl mx-auto mt-10 flex gap-4">
      <Card className="flex-1 p-6">
        <CardHeader className="flex justify-between items-center">
          <CardTitle>Student Poll Room</CardTitle>
          {joinedRoom && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">☰</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() =>
                  setActiveMenu(activeMenu === "room" ? null : "room")
                }>
                  📄 Room Info
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() =>
                  setActiveMenu(activeMenu === "previous" ? null : "previous")
                }>
                  🗂 Previous Polls
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exitRoom} className="text-red-600">
                  ❌ Leave Room
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </CardHeader>
        <CardContent>
          {!joinedRoom ? (
            <>
              <Input
                placeholder="Enter room code"
                value={roomCode}
                onChange={(e) => { setRoomCode(e.target.value); setRoomError(null); }}
                className="mb-3"
              />
              {roomError && <div className="text-red-500 text-sm mb-2">{roomError}</div>}
              <Button className="w-full" onClick={joinRoom}>Join Room</Button>
            </>
          ) : (
            <>
              <div className="font-semibold mb-2">Active Polls:</div>
              {polls.filter(p => answeredPolls[p.id] === undefined).length === 0 && (
                <div className="text-sm">Waiting for new polls...</div>
              )}
              {polls.filter(p => answeredPolls[p.id] === undefined).map((poll) => (
                <div key={poll.id} className="p-3 border rounded-md mb-3">
                  <div className="font-medium">{poll.question}</div>
                  <div className="mt-2 space-y-2">
                    {poll.options.map((opt, i) => (
                      <Button
                        key={i}
                        variant="outline"
                        className="w-full"
                        onClick={() => submitAnswer(poll.id, i)}
                      >
                        {opt}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </CardContent>
      </Card>

      {/* 👉 Side panel */}
      {activeMenu && (
        <div className="w-64 p-4 border rounded-md bg-gray-50 dark:bg-gray-800">
          {activeMenu === "room" && roomDetails && (
            <>
              <div className="font-semibold mb-2">Room Details</div>
              <div className="text-xs">
                Code: {roomDetails.code}<br/>
                Creator: {roomDetails.creatorId}<br/>
                Created: {new Date(roomDetails.createdAt).toLocaleString()}
              </div>
            </>
          )}
          {activeMenu === "previous" && (
            <>
              <div className="font-semibold mb-2">Previous Polls</div>
              <div className="text-xs space-y-1">
                {Object.keys(answeredPolls).length === 0 ? (
                  <div>No previous polls</div>
                ) : polls.filter(p => answeredPolls[p.id] !== undefined).map((poll) => (
                  <div key={poll.id}>
                    ✔ {poll.question}: <span className="font-semibold">{poll.options[answeredPolls[poll.id]]}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
