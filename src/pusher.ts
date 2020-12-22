import Pusher from "pusher";
import PusherClient from "pusher-js";
import * as uuid from "uuid";
import { utc as moment } from "moment";

const SERVICE_NAME = "google-sheets";
const ELECTION_CHANNEL_NAME = `${SERVICE_NAME}-elections`;

const INSTANCE_ID = uuid.v4();

let candidates: string[] = [];
let leaderId: string = "";

interface Announcement {
  id: string;
}
type LeaderResponsibility = [() => any, (returnValue: any) => any, any]
const leaderResponsibilities: LeaderResponsibility[] = []

const pusher = new Pusher({
  appId: "1127190",
  key: "e6aefb5e7cf5c7c568e4",
  secret: "ca48e44e47a0dc148030",
  cluster: "eu",
  useTLS: true,
});
const pusherClient = new PusherClient("e6aefb5e7cf5c7c568e4", { cluster: "eu" });

const electionChannel = pusherClient.subscribe(ELECTION_CHANNEL_NAME);

const handleAnnouncement = (data: Announcement) => {
  candidates.push(data.id);
};

electionChannel.bind("announcement", handleAnnouncement);

export const announce = async () => {
  console.log("Announcing candidacy");
  await pusher.trigger(ELECTION_CHANNEL_NAME, "announcement", { id: INSTANCE_ID });
};

const electLeader = () => {
  handOverResponsibilities()

  if (!candidates.length) {
    leaderId = "";
    candidates = [];
    return;
  }
  console.log("electing leader");
  leaderId = candidates[0];
  candidates = [];

  if (leaderId === INSTANCE_ID) {
    takeCareOfResponsibilities()
    return
  }
};

const holdElection = () => {
  console.log("Holding election");
  announce();
  setTimeout(electLeader, 2000);
  setTimeout(holdElection, getTimeUntilNextElection())
};

const getTimeUntilNextElection = () => {
  const nextElectionTime = moment().startOf('minute').add(1, 'minute')
  console.log('next election happening at:', nextElectionTime.format('hh:mm:ss'))
  const timeDifference = nextElectionTime.valueOf() - moment().valueOf()
  return timeDifference
}

export const addLeaderResponsibility = (leaderResponsibility: LeaderResponsibility) => {
  leaderResponsibilities.push(leaderResponsibility)
}

const takeCareOfResponsibilities = () => {
  leaderResponsibilities.forEach((resp) => {
    resp[2] = resp[0]()
  })
}

const handOverResponsibilities = () => {
  leaderResponsibilities.forEach(([_, handover, returnValue]) => {
    handover(returnValue)
  })
}

addLeaderResponsibility([() => console.log('I won putas', INSTANCE_ID), () => {}, null])

setTimeout(holdElection, getTimeUntilNextElection())
