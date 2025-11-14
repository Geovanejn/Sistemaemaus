import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import * as schema from '../../shared/schema-worker';
import type { IStorage, User, InsertUser, Position, Election, Candidate, InsertCandidate, Vote, InsertVote, VerificationCode, InsertVerificationCode, CandidateWithDetails, ElectionResults, ElectionPosition, ElectionAttendance } from '../../shared/storage';
import type { D1Database } from '@cloudflare/workers-types';

export class D1Storage implements IStorage {
  private readonly db: DrizzleD1Database<typeof schema>;

  constructor(d1: D1Database) {
    this.db = drizzle(d1, { schema });
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await this.db.query.users.findFirst({
      where: eq(schema.users.email, email),
    });
    return result;
  }

  async getUserById(id: number): Promise<User | undefined> {
    const result = await this.db.query.users.findFirst({
      where: eq(schema.users.id, id),
    });
    return result;
  }

  async createUser(user: InsertUser): Promise<User> {
    const result = await this.db.insert(schema.users).values(user).returning();
    return result[0];
  }

  async updateUser(id: number, updates: Partial<Omit<User, 'id'>>): Promise<User | undefined> {
    const result = await this.db
      .update(schema.users)
      .set(updates)
      .where(eq(schema.users.id, id))
      .returning();
    return result[0];
  }

  async getAllMembers(excludeAdmins: boolean = false): Promise<User[]> {
    const whereClause = excludeAdmins 
      ? and(eq(schema.users.isMember, true), eq(schema.users.isAdmin, false))
      : eq(schema.users.isMember, true);
    
    return await this.db.query.users.findMany({
      where: whereClause,
      orderBy: [asc(schema.users.fullName)],
    });
  }

  async deleteMember(id: number): Promise<void> {
    await this.db.delete(schema.users).where(eq(schema.users.id, id));
  }

  async getAllPositions(): Promise<Position[]> {
    return await this.db.query.positions.findMany({
      orderBy: [asc(schema.positions.name)],
    });
  }

  async getActiveElection(): Promise<Election | null> {
    const result = await this.db.query.elections.findFirst({
      where: and(
        eq(schema.elections.isActive, true),
        sql`${schema.elections.closedAt} IS NULL`
      ),
    });
    return result || null;
  }

  async getElectionById(id: number): Promise<Election | undefined> {
    return await this.db.query.elections.findFirst({
      where: eq(schema.elections.id, id),
    });
  }

  async createElection(name: string): Promise<Election> {
    const result = await this.db.insert(schema.elections).values({
      name,
    }).returning();
    return result[0];
  }

  async closeElection(id: number): Promise<void> {
    await this.db
      .update(schema.elections)
      .set({ closedAt: new Date().toISOString() })
      .where(eq(schema.elections.id, id));
  }

  async finalizeElection(id: number): Promise<void> {
    await this.db
      .update(schema.elections)
      .set({ 
        isActive: false,
        closedAt: new Date().toISOString()
      })
      .where(eq(schema.elections.id, id));
  }

  async getElectionHistory(): Promise<Election[]> {
    return await this.db.query.elections.findMany({
      orderBy: [desc(schema.elections.createdAt)],
    });
  }

  async setWinner(electionId: number, candidateId: number, positionId: number, scrutiny: number): Promise<void> {
    await this.db.insert(schema.electionWinners).values({
      electionId,
      candidateId,
      positionId,
      wonAtScrutiny: scrutiny,
    });
  }

  async getElectionPositions(electionId: number): Promise<ElectionPosition[]> {
    return await this.db.query.electionPositions.findMany({
      where: eq(schema.electionPositions.electionId, electionId),
      orderBy: [asc(schema.electionPositions.orderIndex)],
    });
  }

  async getActiveElectionPosition(electionId: number): Promise<ElectionPosition | null> {
    const result = await this.db.query.electionPositions.findFirst({
      where: and(
        eq(schema.electionPositions.electionId, electionId),
        eq(schema.electionPositions.status, 'open')
      ),
    });
    return result || null;
  }

  async getElectionPositionById(id: number): Promise<ElectionPosition | null> {
    const result = await this.db.query.electionPositions.findFirst({
      where: eq(schema.electionPositions.id, id),
    });
    return result || null;
  }

  async advancePositionScrutiny(electionPositionId: number): Promise<void> {
    const position = await this.getElectionPositionById(electionPositionId);
    if (!position) throw new Error('Position not found');

    const newScrutiny = position.currentScrutiny + 1;
    await this.db
      .update(schema.electionPositions)
      .set({ currentScrutiny: newScrutiny })
      .where(eq(schema.electionPositions.id, electionPositionId));
  }

  async openNextPosition(electionId: number): Promise<ElectionPosition | null> {
    const completed = await this.db.query.electionPositions.findMany({
      where: and(
        eq(schema.electionPositions.electionId, electionId),
        eq(schema.electionPositions.status, 'completed')
      ),
    });

    const all = await this.db.query.electionPositions.findMany({
      where: eq(schema.electionPositions.electionId, electionId),
      orderBy: [asc(schema.electionPositions.orderIndex)],
    });

    const next = all[completed.length];
    if (!next) return null;

    await this.db
      .update(schema.electionPositions)
      .set({ status: 'open' })
      .where(eq(schema.electionPositions.id, next.id));

    return await this.getElectionPositionById(next.id);
  }

  async openPosition(electionPositionId: number): Promise<ElectionPosition> {
    await this.db
      .update(schema.electionPositions)
      .set({ status: 'open' })
      .where(eq(schema.electionPositions.id, electionPositionId));

    const result = await this.getElectionPositionById(electionPositionId);
    if (!result) throw new Error('Position not found');
    return result;
  }

  async completePosition(electionPositionId: number): Promise<void> {
    await this.db
      .update(schema.electionPositions)
      .set({ status: 'completed' })
      .where(eq(schema.electionPositions.id, electionPositionId));
  }

  async forceCompletePosition(electionPositionId: number, reason: string, shouldReopen: boolean = false): Promise<void> {
    console.log(`[ADMIN OVERRIDE] Forcing completion of position ${electionPositionId}. Reason: ${reason}. Reopen: ${shouldReopen}`);
    
    const position = await this.getElectionPositionById(electionPositionId);
    if (!position) {
      throw new Error("Cargo não encontrado");
    }

    if (shouldReopen) {
      console.log(`[ADMIN OVERRIDE] Clearing votes and winners for position ${electionPositionId} to reopen (preserving candidates)`);
      
      await this.db
        .delete(schema.votes)
        .where(and(
          eq(schema.votes.electionId, position.electionId),
          eq(schema.votes.positionId, position.positionId)
        ));

      await this.db
        .delete(schema.electionWinners)
        .where(and(
          eq(schema.electionWinners.electionId, position.electionId),
          eq(schema.electionWinners.positionId, position.positionId)
        ));

      const originalOpenedAt = position.openedAt || new Date().toISOString();
      await this.db
        .update(schema.electionPositions)
        .set({ 
          status: 'open',
          currentScrutiny: 1,
          openedAt: originalOpenedAt,
          closedAt: null
        })
        .where(eq(schema.electionPositions.id, electionPositionId));

      console.log(`[ADMIN OVERRIDE] Position ${electionPositionId} reopened for revote (votes/winners cleared, candidates preserved, status='open', original openedAt preserved)`);
    } else {
      await this.db
        .update(schema.electionPositions)
        .set({ 
          status: 'completed',
          closedAt: new Date().toISOString()
        })
        .where(eq(schema.electionPositions.id, electionPositionId));
    }
  }

  async getElectionAttendance(electionId: number): Promise<ElectionAttendance[]> {
    return await this.db.query.electionAttendance.findMany({
      where: eq(schema.electionAttendance.electionId, electionId),
    });
  }

  async getPresentCount(electionId: number): Promise<number> {
    const attendance = await this.db.query.electionAttendance.findMany({
      where: and(
        eq(schema.electionAttendance.electionId, electionId),
        eq(schema.electionAttendance.isPresent, true)
      ),
    });
    return attendance.length;
  }

  async getPresentCountForPosition(electionPositionId: number): Promise<number> {
    const position = await this.getElectionPositionById(electionPositionId);
    if (!position) return 0;
    
    return this.getPresentCount(position.electionId);
  }

  async isMemberPresent(electionId: number, memberId: number): Promise<boolean> {
    const attendance = await this.db.query.electionAttendance.findFirst({
      where: and(
        eq(schema.electionAttendance.electionId, electionId),
        eq(schema.electionAttendance.memberId, memberId)
      ),
    });
    return attendance?.isPresent || false;
  }

  async setMemberAttendance(electionId: number, memberId: number, isPresent: boolean): Promise<void> {
    const existing = await this.db.query.electionAttendance.findFirst({
      where: and(
        eq(schema.electionAttendance.electionId, electionId),
        eq(schema.electionAttendance.memberId, memberId)
      ),
    });

    if (existing) {
      await this.db
        .update(schema.electionAttendance)
        .set({ isPresent })
        .where(and(
          eq(schema.electionAttendance.electionId, electionId),
          eq(schema.electionAttendance.memberId, memberId)
        ));
    } else {
      await this.db.insert(schema.electionAttendance).values({
        electionId,
        memberId,
        isPresent,
      });
    }
  }

  async initializeAttendance(electionId: number): Promise<void> {
    const members = await this.getAllMembers();
    const activeMembers = members.filter(m => m.activeMember);
    
    for (const member of activeMembers) {
      const existing = await this.db.query.electionAttendance.findFirst({
        where: and(
          eq(schema.electionAttendance.electionId, electionId),
          eq(schema.electionAttendance.memberId, member.id)
        ),
      });
      
      if (!existing) {
        await this.db.insert(schema.electionAttendance).values({
          electionId,
          memberId: member.id,
          isPresent: false,
        });
      }
    }
  }

  async createAttendanceSnapshot(electionPositionId: number): Promise<void> {
    return;
  }

  async getAllCandidates(): Promise<Candidate[]> {
    return await this.db.query.candidates.findMany();
  }

  async getCandidatesByElection(electionId: number): Promise<CandidateWithDetails[]> {
    const candidatesWithRelations = await this.db.query.candidates.findMany({
      where: eq(schema.candidates.electionId, electionId),
      with: {
        user: true,
        position: true,
        election: true,
      },
    });

    return candidatesWithRelations.map(c => {
      const { user, position, election, ...candidate } = c;
      return {
        ...candidate,
        positionName: position.name,
        electionName: election.name,
        photoUrl: user.photoUrl || undefined,
      };
    });
  }

  async getCandidatesByPosition(positionId: number, electionId: number): Promise<Candidate[]> {
    return await this.db.query.candidates.findMany({
      where: and(
        eq(schema.candidates.positionId, positionId),
        eq(schema.candidates.electionId, electionId)
      ),
    });
  }

  async createCandidate(candidate: InsertCandidate): Promise<Candidate> {
    const result = await this.db.insert(schema.candidates).values(candidate).returning();
    return result[0];
  }

  async clearCandidatesForPosition(positionId: number, electionId: number): Promise<void> {
    await this.db
      .delete(schema.candidates)
      .where(and(
        eq(schema.candidates.positionId, positionId),
        eq(schema.candidates.electionId, electionId)
      ));
  }

  async createVote(vote: InsertVote): Promise<Vote> {
    const result = await this.db.insert(schema.votes).values(vote).returning();
    return result[0];
  }

  async hasUserVoted(voterId: number, positionId: number, electionId: number, scrutinyRound: number): Promise<boolean> {
    const vote = await this.db.query.votes.findFirst({
      where: and(
        eq(schema.votes.voterId, voterId),
        eq(schema.votes.positionId, positionId),
        eq(schema.votes.electionId, electionId),
        eq(schema.votes.scrutinyRound, scrutinyRound)
      ),
    });
    return !!vote;
  }

  async getElectionResults(electionId: number): Promise<ElectionResults | null> {
    const election = await this.getElectionById(electionId);
    if (!election) return null;

    const electionPositionsRaw = await this.db
      .select({
        id: schema.electionPositions.id,
        electionId: schema.electionPositions.electionId,
        positionId: schema.electionPositions.positionId,
        orderIndex: schema.electionPositions.orderIndex,
        status: schema.electionPositions.status,
        currentScrutiny: schema.electionPositions.currentScrutiny,
        openedAt: schema.electionPositions.openedAt,
        closedAt: schema.electionPositions.closedAt,
        positionName: schema.positions.name,
      })
      .from(schema.electionPositions)
      .leftJoin(schema.positions, eq(schema.electionPositions.positionId, schema.positions.id))
      .where(eq(schema.electionPositions.electionId, electionId))
      .orderBy(asc(schema.electionPositions.orderIndex));

    const presentCount = await this.getPresentCount(electionId);
    const openPosition = electionPositionsRaw.find(ep => ep.status === 'open');

    const results: ElectionResults = {
      electionId: election.id,
      electionName: election.name,
      isActive: election.isActive,
      currentScrutiny: openPosition?.currentScrutiny || 1,
      presentCount,
      createdAt: election.createdAt,
      closedAt: election.closedAt,
      positions: [],
    };

    const winners = await this.getElectionWinners(electionId);
    const winnersMap = new Map(winners.map(w => [w.positionId, { candidateId: w.candidateId, wonAtScrutiny: w.wonAtScrutiny }]));

    const allVotesWithDetails = await this.db.query.votes.findMany({
      where: eq(schema.votes.electionId, electionId),
      with: {
        candidate: {
          with: {
            user: true,
          },
        },
      },
    });

    const votesByPosition = new Map<number, typeof allVotesWithDetails>();
    for (const vote of allVotesWithDetails) {
      const key = vote.positionId;
      if (!votesByPosition.has(key)) {
        votesByPosition.set(key, []);
      }
      votesByPosition.get(key)!.push(vote);
    }

    for (const electionPosition of electionPositionsRaw) {
      const currentScrutiny = electionPosition.currentScrutiny;
      const positionId = electionPosition.positionId;
      
      const positionVotes = votesByPosition.get(positionId) || [];
      const votes = positionVotes.filter(v => v.scrutinyRound === currentScrutiny);

      const candidateVotes = new Map<number, number>();
      const candidateData = new Map<number, any>();
      const voters = new Set<number>();

      for (const vote of votes) {
        const candidateId = vote.candidateId;
        candidateVotes.set(candidateId, (candidateVotes.get(candidateId) || 0) + 1);
        voters.add(vote.voterId);
        if (!candidateData.has(candidateId)) {
          const photoUrl = vote.candidate.user?.photoUrl || 
            await schema.getGravatarUrl(vote.candidate.email);
          candidateData.set(candidateId, {
            candidateId,
            candidateName: vote.candidate.name,
            candidateEmail: vote.candidate.email,
            photoUrl,
          });
        }
      }

      const totalVoters = voters.size;
      const majorityThreshold = currentScrutiny === 3 ? 1 : Math.floor(presentCount / 2) + 1;

      const candidatesArray = Array.from(candidateData.values()).map(c => ({
        ...c,
        voteCount: candidateVotes.get(c.candidateId) || 0,
        isElected: false,
        electedInScrutiny: undefined as number | undefined,
      })).sort((a, b) => b.voteCount - a.voteCount);

      let winnerId: number | undefined;
      let winnerScrutiny: number | undefined;
      let needsNextScrutiny = false;

      const winner = winnersMap.get(positionId);
      if (winner) {
        winnerId = winner.candidateId;
        winnerScrutiny = winner.wonAtScrutiny;
      } else if (candidatesArray.length > 0) {
        const topCandidate = candidatesArray[0];
        if (currentScrutiny < 3 && topCandidate.voteCount >= majorityThreshold) {
          winnerId = topCandidate.candidateId;
          winnerScrutiny = currentScrutiny;
        } else if (currentScrutiny === 3) {
          if (candidatesArray.length > 1 && topCandidate.voteCount === candidatesArray[1].voteCount) {
            needsNextScrutiny = false;
          } else if (topCandidate.voteCount > 0) {
            winnerId = topCandidate.candidateId;
            winnerScrutiny = 3;
          }
        } else if (currentScrutiny < 3 && electionPosition.status === 'open') {
          needsNextScrutiny = true;
        }
      }

      if (winnerId) {
        const electedCandidate = candidatesArray.find(c => c.candidateId === winnerId);
        if (electedCandidate) {
          electedCandidate.isElected = true;
          electedCandidate.electedInScrutiny = winnerScrutiny;
        }
      }

      results.positions.push({
        positionId: electionPosition.positionId,
        positionName: electionPosition.positionName || "",
        status: electionPosition.status,
        currentScrutiny,
        orderIndex: electionPosition.orderIndex,
        totalVoters,
        majorityThreshold,
        needsNextScrutiny,
        winnerId,
        winnerScrutiny,
        candidates: candidatesArray,
      });
    }

    return results;
  }

  async getLatestElectionResults(): Promise<ElectionResults | null> {
    const elections = await this.db.query.elections.findMany({
      where: and(
        eq(schema.elections.isActive, false),
        sql`${schema.elections.closedAt} IS NOT NULL`
      ),
      orderBy: [desc(schema.elections.createdAt)],
      limit: 1,
    });

    if (elections.length === 0) return null;
    return await this.getElectionResults(elections[0].id);
  }

  async getElectionWinners(electionId: number): Promise<Array<{ userId: number; positionId: number; candidateId: number; wonAtScrutiny: number }>> {
    const winnersWithCandidate = await this.db.query.electionWinners.findMany({
      where: eq(schema.electionWinners.electionId, electionId),
      with: {
        candidate: true,
      },
    });

    return winnersWithCandidate.map(w => ({
      userId: w.candidate.userId,
      positionId: w.positionId,
      candidateId: w.candidateId,
      wonAtScrutiny: w.wonAtScrutiny,
    }));
  }

  async getVoterAttendance(electionId: number): Promise<Array<any>> {
    const attendance = await this.db.query.electionAttendance.findMany({
      where: eq(schema.electionAttendance.electionId, electionId),
      with: {
        member: true,
      },
      orderBy: [asc(schema.users.fullName)],
    });

    const votesWithUsers = await this.db.query.votes.findMany({
      where: eq(schema.votes.electionId, electionId),
      with: {
        voter: true,
      },
      orderBy: [asc(schema.votes.createdAt)],
    });

    const voterMap = new Map();
    for (const vote of votesWithUsers) {
      const voterId = vote.voter.id;
      if (!voterMap.has(voterId)) {
        voterMap.set(voterId, {
          firstVoteAt: vote.createdAt,
          totalVotes: 0,
        });
      }
      const voter = voterMap.get(voterId);
      voter.totalVotes++;
      if (vote.createdAt < voter.firstVoteAt) {
        voter.firstVoteAt = vote.createdAt;
      }
    }

    return attendance.map(att => ({
      voterId: att.member.id,
      voterName: att.member.fullName,
      voterEmail: att.member.email,
      isPresent: att.isPresent,
      firstVoteAt: voterMap.get(att.member.id)?.firstVoteAt || null,
      totalVotes: voterMap.get(att.member.id)?.totalVotes || 0,
    })).sort((a, b) => a.voterName.localeCompare(b.voterName));
  }

  async getVoteTimeline(electionId: number): Promise<Array<any>> {
    const votesWithRelations = await this.db.query.votes.findMany({
      where: eq(schema.votes.electionId, electionId),
      with: {
        voter: true,
        position: true,
        candidate: true,
      },
      orderBy: [asc(schema.votes.createdAt)],
    });

    return votesWithRelations.map(v => ({
      voterId: v.voter.id,
      voterName: v.voter.fullName,
      voterEmail: v.voter.email,
      positionName: v.position.name,
      candidateName: v.candidate.name,
      scrutinyRound: v.scrutinyRound,
      votedAt: v.createdAt,
    }));
  }

  async getElectionAuditData(electionId: number): Promise<any | null> {
    const results = await this.getElectionResults(electionId);
    if (!results) return null;

    const election = await this.getElectionById(electionId);
    if (!election) return null;

    const positions = await this.getElectionPositions(electionId);
    const completedPositions = positions.filter(p => p.status === 'completed');

    const members = await this.getAllMembers(true);
    const totalMembers = members.filter(m => m.activeMember).length;

    return {
      results,
      electionMetadata: {
        createdAt: election.createdAt,
        closedAt: election.closedAt || null,
        totalPositions: positions.length,
        completedPositions: completedPositions.length,
        totalMembers,
      },
      voterAttendance: await this.getVoterAttendance(electionId),
      voteTimeline: await this.getVoteTimeline(electionId),
    };
  }

  async createVerificationCode(data: InsertVerificationCode): Promise<VerificationCode> {
    const result = await this.db.insert(schema.verificationCodes).values({
      ...data,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    }).returning();
    return result[0];
  }

  async getValidVerificationCode(email: string, code: string): Promise<VerificationCode | null> {
    const now = new Date().toISOString();
    const result = await this.db.query.verificationCodes.findFirst({
      where: and(
        eq(schema.verificationCodes.email, email),
        eq(schema.verificationCodes.code, code),
        sql`${schema.verificationCodes.expiresAt} > ${now}`
      ),
    });
    return result || null;
  }

  async deleteVerificationCodesByEmail(email: string): Promise<void> {
    await this.db
      .delete(schema.verificationCodes)
      .where(eq(schema.verificationCodes.email, email));
  }

  async createPdfVerification(electionId: number, verificationHash: string, presidentName?: string): Promise<any> {
    const result = await this.db.insert(schema.pdfVerifications).values({
      electionId,
      verificationHash,
      presidentName,
    }).returning();
    return result[0];
  }

  async getPdfVerification(verificationHash: string): Promise<any | null> {
    const result = await this.db.query.pdfVerifications.findFirst({
      where: eq(schema.pdfVerifications.verificationHash, verificationHash),
    });
    return result || null;
  }
}
