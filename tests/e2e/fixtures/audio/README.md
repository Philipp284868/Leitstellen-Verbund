# Audio-Fixtures

Eigenständig erzeugte Sinussignale, keine fremden Aufnahmen. Je 18 Sekunden,
Stereo, 44.1 kHz. `tone.mp3`: 523.25 Hz, MP3 128 kbit/s.
`tone.ogg`: 659.25 Hz, Ogg Vorbis Qualität 3. Beide mit Pegelfaktor 0.35.

Erzeugt mit FFmpeg 7.1 (`sine=frequency=…:duration=18`, `-af volume=0.35`,
`-ar 44100 -ac 2`, `-c:a libmp3lame -b:a 128k` bzw. `-c:a libvorbis -q:a 3`).
WAV wird im Test selbst erzeugt. Die produktive Anwendung enthält keine dieser
Testdateien und benötigt keinen Encoder.
