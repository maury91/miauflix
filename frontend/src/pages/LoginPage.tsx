import React, { useState } from 'react';

import DeviceLogin from '../components/DeviceLogin';
import LoginForm from '../components/LoginForm';

const LoginPage: React.FC = () => {
  const [showDeviceLogin, setShowDeviceLogin] = useState(false);

  return (
    <div>
      <h1>Login</h1>
      <button onClick={() => setShowDeviceLogin(!showDeviceLogin)}>
        {showDeviceLogin ? 'Login with Email/Password' : 'Login with Device'}
      </button>
      {showDeviceLogin ? <DeviceLogin /> : <LoginForm />}
    </div>
  );
};

export default LoginPage;
