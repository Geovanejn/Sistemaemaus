import type {
  User,
  InsertUser,
  Position,
  Election,
  Candidate,
  InsertCandidate,
  Vote,
  InsertVote,
  VerificationCode,
  InsertVerificationCode,
  CandidateWithDetails,
  ElectionResults,
  ElectionPosition,
  ElectionAttendance,
} from "./schema";

export interface IStorage {
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserById(id: number): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, updates: Partial<Omit<User, 'id'>>): Promise<User | undefined>;
  getAllMembers(excludeAdmins?: boolean): Promise<User[]>;
  deleteMember(id: number): Promise<void>;
  
  getAllPositions(): Promise<Position[]>;
  
  getActiveElection(): Promise<Election | null>;
  getElectionById(id: number): Promise<Election | undefined>;
  createElection(name: string): Promise<Election>;
  closeElection(id: number): Promise<void>;
  finalizeElection(id: number): Promise<void>;
  getElectionHistory(): Promise<Election[]>;
  setWinner(electionId: number, candidateId: number, positionId: number, scrutiny: number): Promise<void>;
  
  // Election Positions management
  getElectionPositions(electionId: number): Promise<ElectionPosition[]>;
  getActiveElectionPosition(electionId: number): Promise<ElectionPosition | null>;
  getElectionPositionById(id: number): Promise<ElectionPosition | null>;
  advancePositionScrutiny(electionPositionId: number): Promise<void>;
  openNextPosition(electionId: number): Promise<ElectionPosition | null>;
  openPosition(electionPositionId: number): Promise<ElectionPosition>;
  completePosition(electionPositionId: number): Promise<void>;
  forceCompletePosition(electionPositionId: number, reason: string, shouldReopen?: boolean): Promise<void>;
  
  // Election Attendance management
  getElectionAttendance(electionId: number): Promise<ElectionAttendance[]>;
  getPresentCount(electionId: number): Promise<number>;
  getPresentCountForPosition(electionPositionId: number): Promise<number>;
  isMemberPresent(electionId: number, memberId: number): Promise<boolean>;
  setMemberAttendance(electionId: number, memberId: number, isPresent: boolean): Promise<void>;
  initializeAttendance(electionId: number): Promise<void>;
  createAttendanceSnapshot(electionPositionId: number): Promise<void>;
  
  getAllCandidates(): Promise<Candidate[]>;
  getCandidatesByElection(electionId: number): Promise<CandidateWithDetails[]>;
  getCandidatesByPosition(positionId: number, electionId: number): Promise<Candidate[]>;
  createCandidate(candidate: InsertCandidate): Promise<Candidate>;
  clearCandidatesForPosition(positionId: number, electionId: number): Promise<void>;
  
  createVote(vote: InsertVote): Promise<Vote>;
  hasUserVoted(voterId: number, positionId: number, electionId: number, scrutinyRound: number): Promise<boolean>;
  
  getElectionResults(electionId: number): Promise<ElectionResults | null>;
  getLatestElectionResults(): Promise<ElectionResults | null>;
  getElectionWinners(electionId: number): Promise<Array<{ userId: number; positionId: number; candidateId: number; wonAtScrutiny: number }>>;
  
  getVoterAttendance(electionId: number): Promise<Array<any>>;
  getVoteTimeline(electionId: number): Promise<Array<any>>;
  getElectionAuditData(electionId: number): Promise<any | null>;
  
  createVerificationCode(data: InsertVerificationCode): Promise<VerificationCode>;
  getValidVerificationCode(email: string, code: string): Promise<VerificationCode | null>;
  deleteVerificationCodesByEmail(email: string): Promise<void>;
  
  createPdfVerification(electionId: number, verificationHash: string, presidentName?: string): Promise<any>;
  getPdfVerification(verificationHash: string): Promise<any | null>;
}

export { User, InsertUser, Position, Election, Candidate, InsertCandidate, Vote, InsertVote, VerificationCode, InsertVerificationCode, CandidateWithDetails, ElectionResults, ElectionPosition, ElectionAttendance };
