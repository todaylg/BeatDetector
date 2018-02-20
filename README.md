# BeatDetector.js
<h2>Usage</h2>


```html

 <audio id="audioEle" src="./test.mp3"></audio>
 <script src="../BeatDetector.js"></script>
 <script>
    let audioEle = document.getElementById("audioEle");
    
    BeatDetector(audioEle, analysisFin, onBeat, onBigBeat);
    
    function analysisFin(){
        audioEle.play();
    }
    
    function onBeat(){
        console.log("Emit Beat");
    }

    function onBigBeat(){
        console.log("Wow!! Emit BigBeat");
    }
 </script>

```
