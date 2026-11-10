export interface PortraitCrop {zoom:number;x:number;y:number;}
/** One source rectangle drives both the preview and the saved square portrait. */
export function portraitRectangle(width:number,height:number,crop:PortraitCrop){
 const side=Math.min(width,height)/Math.max(1,Math.min(3,crop.zoom));
 return {x:(width-side)*Math.max(0,Math.min(100,crop.x))/100,y:(height-side)*Math.max(0,Math.min(100,crop.y))/100,side};
}
export function drawPortrait(canvas:HTMLCanvasElement,image:HTMLImageElement,crop:PortraitCrop){
 const {x,y,side}=portraitRectangle(image.naturalWidth,image.naturalHeight,crop),context=canvas.getContext('2d');
 if(!context)throw Error('Image editing is unavailable in this browser.');
 canvas.width=320;canvas.height=320;context.fillStyle='#FFF8E7';context.fillRect(0,0,320,320);context.drawImage(image,x,y,side,side,0,0,320,320);
}
