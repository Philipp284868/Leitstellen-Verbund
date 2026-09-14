import type {FireProfile} from "../../src/shared/facilities/fire-profile";
export function classifyFireProfile(tags:Record<string,string>):Pick<FireProfile,"kind"|"employment"|"reason">;
export function osmFireProfile(records:{source:string;tags:Record<string,string>}[], snapshot:string):FireProfile;
