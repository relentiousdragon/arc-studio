export const xmasSnow = (date = new Date()) => date.getMonth() === 11 && date.getDate() >= 20;
export const halloweenFrills = (date = new Date()) => date.getMonth() === 9 && date.getDate() >= 15;
export const fallLeaves = (date = new Date()) => date.getMonth() === 9;
