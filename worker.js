self.onmessage = function (e) {
    try {
        const buffer = e.data
        const text = new TextDecoder('utf-8').decode(buffer)
        const data = JSON.parse(text)
        self.postMessage({ success: true, payload: data })
    } catch (err) {
        self.postMessage({ success: false, error: err.toString() })
    }
}
